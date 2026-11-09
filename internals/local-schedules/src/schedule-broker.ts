import { randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createDispatch } from './dispatch';
import { generateScheduleId, scheduleExecutionId } from './ids';
import {
  SINGLE_AT_PAST_GRACE_MS,
  dispatchDeadline,
  nextCronOccurrence,
  nextOccurrence,
  normalizeSingleAt,
  singleOccurrence,
  validateCronJitter,
  validateTimezone,
} from './timing';
import {
  ScheduleBrokerError,
  type CreateScheduleInput,
  type Schedule,
  type ScheduleDefinition,
  type ScheduleDispatch,
  type ScheduleIdentifier,
  type ScheduleScope,
  type StaticScheduleInput,
  type UpdateScheduleInput,
} from './types';

// Recheck wall time after sleep/wake or a clock adjustment. Never pass long
// delays to Node, which would silently turn overflowing timeouts into 1ms.
const MAX_TIMER_DELAY = 60_000;

// Matches subscriber-dispatch-schedules: never jitter into the window's last seconds.
const JITTER_END_BUFFER_SECONDS = 10;

export interface ScheduleBrokerOptions extends ScheduleScope {
  dispatch: (invocation: ScheduleDispatch) => void | Promise<void>;
  /** Reports automatic dispatch failures; manual invoke rejects instead. */
  onError: (error: unknown, invocation: ScheduleDispatch) => void;
  now?: () => number;
  random?: () => number;
}

interface Entry {
  schedule: Schedule;
  payload?: string;
  next?: number;
  lastScheduledAt?: number;
  consumed: boolean;
  pending: Map<number, number>;
  controllers: Set<AbortController>;
}

interface Prepared {
  expression: Schedule['expression'];
  timezone: string;
  jitter?: number;
  target: Schedule['target'];
  payload?: string;
  next?: number;
}

function invalid(
  message: string,
  code: ScheduleBrokerError['code'] = 'invalid_request'
): never {
  throw new ScheduleBrokerError(code, message);
}

function identifier(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length > 256 ||
    !/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(value)
  ) {
    invalid(
      'Expected a schedule name or namespace starting with a letter or number and containing only letters, numbers, and . _ -'
    );
  }
  return value;
}

/** Messages and codes match the hosted Schedules API. */
function assertMutable(entry: Entry): void {
  if (entry.schedule.source === 'static') {
    invalid(
      'Static schedules cannot be updated or deleted. Enable or disable them instead.',
      'static_schedule'
    );
  }
}

function isSingleAtPassed(schedule: Schedule, now: number): boolean {
  return (
    schedule.expression.type === 'single' &&
    singleOccurrence(schedule.expression.at, schedule.timezone) <= now
  );
}

function assertSingleAtNotPassed(entry: Entry, now: number): void {
  if (isSingleAtPassed(entry.schedule, now)) {
    invalid(
      'The schedule has reached its fire time and can no longer be changed',
      'schedule_single_at_passed'
    );
  }
}

function keyOf(input: ScheduleIdentifier): string {
  return `${identifier(input.namespace ?? 'default')}/${identifier(input.name)}`;
}

function serializePayload(payload: unknown): string | undefined {
  if (payload === undefined) return undefined;
  try {
    const result = JSON.stringify(payload);
    if (result === undefined) invalid('Payload must be JSON serializable');
    return result;
  } catch {
    invalid('Payload must be JSON serializable');
  }
}

interface PrepareOptions {
  now: number;
  /** Already-materialized occurrences, including canceled ones, never rearm. */
  lastScheduledAt?: number;
  /** Reject single-fire times further in the past than the grace period. */
  validateSingleAt?: boolean;
}

function prepare(
  input: ScheduleDefinition,
  { now, lastScheduledAt = -Infinity, validateSingleAt = false }: PrepareOptions
): Prepared {
  const timezone = input.timezone ?? 'UTC';
  validateTimezone(timezone);
  if (
    input.jitter !== undefined &&
    (!Number.isInteger(input.jitter) || input.jitter < 1 || input.jitter > 15)
  ) {
    invalid('Jitter must be an integer from 1 to 15 minutes');
  }
  const target = input.target;
  const targetRef =
    target?.type === 'queue'
      ? target.topic
      : target?.type === 'function'
        ? target.function
        : target?.type === 'path'
          ? target.path
          : undefined;
  if (
    !target ||
    (target.type !== 'queue' &&
      target.type !== 'function' &&
      target.type !== 'path') ||
    typeof targetRef !== 'string' ||
    !targetRef
  ) {
    invalid('Expected a queue topic, function, or path target');
  }
  if (
    target.type === 'path' &&
    target.requestMethod !== undefined &&
    target.requestMethod !== 'GET' &&
    target.requestMethod !== 'POST'
  ) {
    invalid('Path target requestMethod must be GET or POST');
  }
  const expression: Schedule['expression'] =
    input.expression?.type === 'single'
      ? { type: 'single', at: normalizeSingleAt(input.expression.at) }
      : { ...input.expression };
  let next: number | undefined;
  if (expression.type === 'single') {
    const at = singleOccurrence(expression.at, timezone);
    if (validateSingleAt && at <= now - SINGLE_AT_PAST_GRACE_MS) {
      invalid('Single-fire time is in the past', 'single_at_in_past');
    }
    // A time within the grace period fires immediately.
    next =
      at >= Math.max(now - SINGLE_AT_PAST_GRACE_MS, lastScheduledAt + 1)
        ? at
        : undefined;
  } else {
    next = nextOccurrence(
      expression,
      timezone,
      Math.max(now, lastScheduledAt + 1)
    );
    if (input.jitter !== undefined) {
      validateCronJitter(expression.cron, timezone, input.jitter);
    }
  }
  return {
    expression,
    timezone,
    ...(input.jitter === undefined ? {} : { jitter: input.jitter }),
    target: { ...target },
    payload: serializePayload(input.payload),
    next,
  };
}

function withActiveUntil(
  schedule: Schedule,
  activeUntil: number | undefined,
  now: number
): Schedule {
  const { activeUntil: _previous, ...rest } = schedule;
  return {
    ...rest,
    ...(activeUntil === undefined ? {} : { activeUntil }),
    updatedAt: now,
  };
}

/** One instance owns exactly one project/track registry. Importing is inert. */
export class ScheduleBroker {
  private readonly entries = new Map<string, Entry>();
  private readonly inFlight = new Set<Promise<void>>();
  private readonly scope: ScheduleScope;
  private readonly now: () => number;
  private readonly random: () => number;
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private closed = false;

  constructor(private readonly options: ScheduleBrokerOptions) {
    this.scope = {
      ownerId: options.ownerId,
      projectId: options.projectId,
      trackId: options.trackId,
    };
    if (
      Object.values(this.scope).some(
        value => typeof value !== 'string' || !value
      )
    ) {
      invalid('An owner, project, and track are required');
    }
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  start(): void {
    this.assertOpen();
    this.running = true;
    this.arm();
  }

  create(input: CreateScheduleInput): Schedule {
    this.assertOpen();
    if (input.target.type !== 'queue')
      invalid('Dynamic schedules require a queue target');
    const name = input.name ?? `dyn.${randomBytes(12).toString('hex')}`;
    const key = keyOf({ ...input, name });
    if (this.entries.has(key)) {
      throw new ScheduleBrokerError(
        'conflict',
        `Schedule ${key} already exists`
      );
    }
    const entry = this.insert(
      { ...input, name },
      prepare(input, { now: this.now(), validateSingleAt: true }),
      'dynamic'
    );
    this.arm();
    return structuredClone(entry.schedule);
  }

  get(input: ScheduleIdentifier): Schedule {
    return structuredClone(this.require(input).schedule);
  }

  list(input: { namespace?: string; cursor?: string; limit?: number } = {}): {
    data: Schedule[];
    cursor: string | null;
  } {
    const namespace = identifier(input.namespace ?? 'default');
    this.expireActivations();
    const limit = input.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      invalid('Limit must be between 1 and 100');
    let after = '';
    const scope = [
      this.scope.ownerId,
      this.scope.projectId,
      this.scope.trackId,
      namespace,
    ];
    if (input.cursor !== undefined) {
      try {
        const cursor: unknown = JSON.parse(
          Buffer.from(input.cursor, 'base64url').toString()
        );
        if (
          !Array.isArray(cursor) ||
          cursor.length !== 5 ||
          !scope.every((value, i) => value === cursor[i])
        ) {
          invalid('Invalid list cursor');
        }
        after = identifier(cursor[4]);
      } catch {
        invalid('Invalid list cursor');
      }
    }
    const records = [...this.entries.values()]
      .map(entry => entry.schedule)
      .filter(
        schedule => schedule.namespace === namespace && schedule.name > after
      )
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const data = records.slice(0, limit);
    return {
      data: structuredClone(data),
      cursor:
        records.length > limit
          ? Buffer.from(
              JSON.stringify([...scope, data[data.length - 1].name])
            ).toString('base64url')
          : null,
    };
  }

  update(input: ScheduleIdentifier, changes: UpdateScheduleInput): Schedule {
    this.assertOpen();
    const entry = this.require(input);
    assertMutable(entry);
    if (changes.target && changes.target.type !== 'queue')
      invalid('Management updates require a queue target');
    const prepared = prepare(
      {
        ...entry.schedule,
        ...changes,
        expression: changes.expression ?? entry.schedule.expression,
        timezone: changes.timezone ?? entry.schedule.timezone,
        target: changes.target ?? entry.schedule.target,
        jitter:
          changes.jitter === null
            ? undefined
            : (changes.jitter ?? entry.schedule.jitter),
        payload:
          changes.payload === undefined
            ? entry.payload === undefined
              ? undefined
              : JSON.parse(entry.payload)
            : changes.payload === null
              ? undefined
              : changes.payload,
      },
      {
        now: this.now(),
        lastScheduledAt: entry.lastScheduledAt,
        validateSingleAt:
          changes.expression !== undefined || changes.timezone !== undefined,
      }
    );
    if (
      changes.expression !== undefined &&
      changes.expression.type !== entry.schedule.expression.type
    ) {
      invalid(
        `Cannot change a ${entry.schedule.expression.type} schedule to a ${changes.expression.type} schedule. Delete it and create a new one instead.`,
        'schedule_type_change_not_allowed'
      );
    }
    assertSingleAtNotPassed(entry, this.now());
    this.replace(entry, prepared);
    this.arm();
    return structuredClone(entry.schedule);
  }

  delete(input: ScheduleIdentifier): { scheduleId: string } {
    this.assertOpen();
    const entry = this.require(input);
    assertMutable(entry);
    if (entry.schedule.state === 'active') {
      assertSingleAtNotPassed(entry, this.now());
    }
    this.cancel(entry);
    this.entries.delete(keyOf(input));
    this.arm();
    return { scheduleId: entry.schedule.scheduleId };
  }

  /**
   * With `until` (Unix ms), the schedule is enabled until that time and then
   * disabled again. It replaces an existing `until`, but can't be set on a
   * schedule that is already enabled without one. Without it, any existing
   * `activeUntil` is cleared and the schedule stays enabled.
   */
  enable(
    input: ScheduleIdentifier,
    options: { until?: number } = {}
  ): Schedule {
    return this.setState(input, 'active', options.until);
  }

  disable(input: ScheduleIdentifier): Schedule {
    return this.setState(input, 'inactive');
  }

  /** Validate a snapshot without changing resources, dispatches, or timers. */
  validateStatic(inputs: StaticScheduleInput[]): void {
    this.prepareStatic(inputs);
  }

  private prepareStatic(inputs: StaticScheduleInput[]) {
    this.assertOpen();
    const prepared = new Map<
      string,
      { input: StaticScheduleInput; value: Prepared }
    >();
    for (const input of inputs) {
      if ('payload' in input) {
        invalid('Static schedule definitions cannot include a payload');
      }
      const key = keyOf(input);
      const existing = this.entries.get(key);
      if (prepared.has(key) || existing?.schedule.source === 'dynamic') {
        throw new ScheduleBrokerError(
          'conflict',
          `Static schedule ${key} conflicts with an existing definition`
        );
      }
      prepared.set(key, {
        input,
        value: prepare(input, {
          now: this.now(),
          lastScheduledAt: existing?.lastScheduledAt,
        }),
      });
    }
    return prepared;
  }

  /** Full static snapshot; conflicts/invalid definitions leave the registry intact. */
  reconcileStatic(inputs: StaticScheduleInput[]): Schedule[] {
    const prepared = this.prepareStatic(inputs);
    for (const [key, entry] of this.entries) {
      if (entry.schedule.source === 'static' && !prepared.has(key)) {
        this.cancel(entry);
        this.entries.delete(key);
      }
    }
    const result: Schedule[] = [];
    for (const [key, { input, value }] of prepared) {
      const existing = this.entries.get(key);
      const entry = existing ?? this.insert(input, value, 'static');
      if (existing && !this.matches(existing, value))
        this.replace(existing, value);
      result.push(structuredClone(entry.schedule));
    }
    this.arm();
    return result;
  }

  /** Manual invocation ignores inactive state and does not consume a one-shot. */
  async invoke(input: ScheduleIdentifier): Promise<void> {
    this.assertOpen();
    const entry = this.require(input);
    const at = this.now();
    await this.dispatch(entry, at, 'manual');
  }

  /** Abort pending work, then drain dispatchers. Dispatchers must honor signal. */
  async close(): Promise<void> {
    this.closed = true;
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    for (const entry of this.entries.values()) this.cancel(entry);
    await Promise.allSettled([...this.inFlight]);
  }

  private assertOpen(): void {
    if (this.closed)
      throw new ScheduleBrokerError('closed', 'Schedule broker is closed');
  }

  private require(input: ScheduleIdentifier): Entry {
    const key = keyOf(input);
    this.expireActivations();
    const entry = this.entries.get(key);
    if (!entry)
      throw new ScheduleBrokerError('not_found', `Schedule ${key} not found`);
    return entry;
  }

  private insert(
    input: ScheduleIdentifier,
    value: Prepared,
    source: Schedule['source']
  ): Entry {
    const { payload, next, ...definition } = value;
    const now = this.now();
    const entry: Entry = {
      schedule: {
        ownerId: this.scope.ownerId,
        projectId: this.scope.projectId,
        ...definition,
        scheduleId: generateScheduleId(),
        name: input.name,
        namespace: input.namespace ?? 'default',
        state: 'active',
        source,
        createdAt: now,
        updatedAt: now,
      },
      payload,
      next,
      consumed: false,
      pending: new Map(),
      controllers: new Set(),
    };
    this.entries.set(keyOf(input), entry);
    return entry;
  }

  private matches(entry: Entry, value: Prepared): boolean {
    return (
      isDeepStrictEqual(entry.schedule.expression, value.expression) &&
      isDeepStrictEqual(entry.schedule.target, value.target) &&
      entry.schedule.timezone === value.timezone &&
      entry.schedule.jitter === value.jitter &&
      entry.payload === value.payload
    );
  }

  private replace(entry: Entry, value: Prepared): void {
    this.cancel(entry);
    if (
      !isDeepStrictEqual(entry.schedule.expression, value.expression) ||
      entry.schedule.timezone !== value.timezone
    ) {
      entry.consumed = false;
    }
    const { payload, next, ...definition } = value;
    entry.schedule = {
      ...entry.schedule,
      ...definition,
      jitter: value.jitter,
      updatedAt: this.now(),
    };
    entry.payload = payload;
    entry.next =
      entry.consumed || entry.schedule.state !== 'active' ? undefined : next;
  }

  private setState(
    input: ScheduleIdentifier,
    state: Schedule['state'],
    activeUntil?: number
  ): Schedule {
    this.assertOpen();
    const entry = this.require(input);
    const now = this.now();
    if (
      activeUntil !== undefined &&
      (!Number.isSafeInteger(activeUntil) || activeUntil <= 0)
    ) {
      invalid('Expected until to be a positive integer of Unix milliseconds');
    }
    if (activeUntil !== undefined && activeUntil <= now) {
      invalid('until must be in the future', 'active_until_in_past');
    }
    if (entry.schedule.state === state) {
      if (state === 'active' && activeUntil !== entry.schedule.activeUntil) {
        if (entry.schedule.activeUntil === undefined) {
          invalid(
            'The schedule is already enabled without an end time. Disable it first to enable it until a time.',
            'schedule_already_active'
          );
        }
        entry.schedule = withActiveUntil(entry.schedule, activeUntil, now);
        this.arm();
      }
    } else {
      assertSingleAtNotPassed(entry, now);
      const next =
        state === 'active' && !entry.consumed
          ? nextOccurrence(
              entry.schedule.expression,
              entry.schedule.timezone,
              this.schedulingBoundary(entry)
            )
          : undefined;
      this.cancel(entry);
      entry.schedule = withActiveUntil(
        { ...entry.schedule, state },
        state === 'active' ? activeUntil : undefined,
        now
      );
      entry.next = next;
      this.arm();
    }
    return structuredClone(entry.schedule);
  }

  /** Disable schedules whose time-bounded activation has passed. */
  private expireActivations(): void {
    const now = this.now();
    for (const entry of this.entries.values()) {
      const { activeUntil } = entry.schedule;
      if (
        entry.schedule.state === 'active' &&
        activeUntil !== undefined &&
        activeUntil <= now
      ) {
        this.cancel(entry);
        entry.schedule = withActiveUntil(
          { ...entry.schedule, state: 'inactive' },
          undefined,
          now
        );
      }
    }
  }

  private schedulingBoundary(entry?: Entry): number {
    // Singles include the boundary itself. Exclude already-materialized times,
    // including canceled occurrences, while still allowing new singles at now.
    return Math.max(this.now(), (entry?.lastScheduledAt ?? -Infinity) + 1);
  }

  private cancel(entry: Entry): void {
    entry.next = undefined;
    entry.pending.clear();
    for (const controller of entry.controllers) controller.abort();
    entry.controllers.clear();
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.running) return;
    let deadline = Infinity;
    for (const entry of this.entries.values()) {
      if (entry.next !== undefined) deadline = Math.min(deadline, entry.next);
      if (
        entry.schedule.state === 'active' &&
        entry.schedule.activeUntil !== undefined
      ) {
        deadline = Math.min(deadline, entry.schedule.activeUntil);
      }
      for (const due of entry.pending.values())
        deadline = Math.min(deadline, due);
    }
    if (!Number.isFinite(deadline)) return;
    this.timer = setTimeout(
      () => this.tick(),
      Math.max(0, Math.min(MAX_TIMER_DELAY, deadline - this.now()))
    );
    this.timer.unref();
  }

  private tick(): void {
    this.timer = undefined;
    if (!this.running) return;
    this.expireActivations();
    const now = this.now();
    for (const entry of this.entries.values()) {
      const { expression, timezone, jitter } = entry.schedule;
      if (entry.next !== undefined && entry.next <= now) {
        const at = entry.next;
        entry.lastScheduledAt = at;
        const offset =
          jitter === undefined
            ? 0
            : Math.floor(
                this.random() *
                  (Math.max(0, jitter * 60 - JITTER_END_BUFFER_SECONDS) + 1)
              ) * 1000;
        entry.pending.set(at, at + offset);
        entry.next =
          expression.type === 'cron'
            ? nextCronOccurrence(expression.cron, timezone, now)
            : undefined;
      }
      for (const [at, due] of entry.pending) {
        if (due > now) continue;
        entry.pending.delete(at);
        // After sleep, an occurrence superseded by the cron's next one is skipped.
        const expiresAt = dispatchDeadline(expression, timezone, jitter, at);
        if (expiresAt !== undefined && now > expiresAt) continue;
        void this.dispatch(entry, at, 'scheduled');
      }
    }
    this.arm();
  }

  private dispatch(
    entry: Entry,
    at: number,
    source: ScheduleDispatch['invokeSource']
  ): Promise<void> {
    const controller = new AbortController();
    entry.controllers.add(controller);
    const invocation = createDispatch(
      structuredClone(entry.schedule),
      entry.payload,
      at,
      scheduleExecutionId(entry.schedule.scheduleId, at),
      source,
      controller.signal
    );
    const promise = Promise.resolve()
      .then(async () => {
        // State/config mutations can cancel between timer expiry and dispatch.
        if (this.closed || controller.signal.aborted) return;
        if (
          source === 'scheduled' &&
          entry.schedule.expression.type === 'single'
        )
          entry.consumed = true;
        try {
          await this.options.dispatch(invocation);
        } catch (error) {
          if (controller.signal.aborted) return;
          if (source === 'manual') throw error;
          try {
            this.options.onError(error, invocation);
          } catch {
            // Scheduled dispatch is not awaited by tick(). Observer failures
            // must not escape as unhandled promise rejections.
          }
        }
      })
      .finally(() => {
        entry.controllers.delete(controller);
        this.inFlight.delete(promise);
      });
    this.inFlight.add(promise);
    return promise;
  }
}
