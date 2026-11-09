import chalk from 'chalk';
import type { JSONObject } from '@vercel-internals/types';
import type Client from '../../util/client';
import { isAPIError } from '../../util/errors-ts';
import {
  handleValidationError,
  normalizeRepeatableStringFilters,
  validateIntegerRangeWithDefault,
  validateTimeBound,
  validateTimeOrder,
  type ValidationError,
} from '../../util/command-validation';
import output from '../../output-manager';
import { diagnoseSubcommand } from './command';
import {
  fetchExperimentContext,
  EXPERIMENTS_NOT_ENABLED_MESSAGE,
  isJson,
  parseSubcommand,
  printExperimentError,
  unitKeyFromBase,
  writeJson,
} from './utils';
import { queryAnalyticsEvents, resolveAnalyticsProjectId } from './api';
import {
  createDiagnosedEventPrinter,
  getExperimentIdentifier,
  printExperimentDiagnosis,
} from './output';
import type {
  AnalyticsEventRow,
  DiagnosedEvent,
  Experiment,
  ExperimentDiagnosis,
} from './types';

const MAX_DIAGNOSE_EVENTS = 200;
const DEFAULT_DIAGNOSE_EVENTS = 50;
/** Web Analytics retains 31 days on the lowest plan; stay inside it. */
const DIAGNOSE_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1_000;

/** Matches the `logs --follow` ceiling, so a forgotten tail cannot run forever. */
const FOLLOW_TIMEOUT_MS = 5 * 60 * 1_000;
const FOLLOW_POLL_INTERVAL_MS = 5_000;
/** A tail window is seconds wide, so a page this size is never the limit. */
const FOLLOW_PAGE_LIMIT = 200;

/** Exported so the poll loop can be exercised without driving a live tail. */
export async function followExperimentEvents({
  client,
  experiment,
  ownerId,
  projectId,
  filter,
  unitField,
  from,
  seen,
  json,
  printedSoFar = 0,
  intervalMs = FOLLOW_POLL_INTERVAL_MS,
  timeoutMs = FOLLOW_TIMEOUT_MS,
}: {
  client: Client;
  experiment: Experiment;
  ownerId: string;
  projectId: string;
  filter: string;
  unitField: string;
  from: Date;
  seen: Map<string, number>;
  json: boolean;
  /** Rows the page already printed, so header repeats stay evenly spaced. */
  printedSoFar?: number;
  intervalMs?: number;
  timeoutMs?: number;
}): Promise<number> {
  const printEvent = createDiagnosedEventPrinter(printedSoFar);
  const abortController = new AbortController();
  const deadline = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);
  const onSigint = () => {
    abortController.abort();
  };
  process.on('SIGINT', onSigint);

  let watermark = from;
  let watermarkSeen = seen;
  try {
    while (!abortController.signal.aborted) {
      await sleepUnlessAborted(intervalMs, abortController.signal);
      if (abortController.signal.aborted) break;

      const end = new Date();
      if (end.getTime() <= watermark.getTime()) continue;

      let rows: AnalyticsEventRow[];
      try {
        rows =
          (
            await queryAnalyticsEvents(client, ownerId, projectId, {
              filter,
              select: ['type', 'eventName', 'eventData'],
              start: toWholeSecondIso(watermark),
              end: toWholeSecondIso(end),
              limit: FOLLOW_PAGE_LIMIT,
              order: 'asc',
            })
          ).events ?? [];
      } catch (error) {
        output.stopSpinner();
        printDiagnoseError(client, error, json);
        return 1;
      }

      const events = rows.map(row =>
        toDiagnosedEvent(
          row,
          row.type === 'exposure' ? 'exposure' : 'event',
          unitField
        )
      );
      const fresh = withoutSeen(events, watermarkSeen);
      if (fresh.length > 0) {
        output.stopSpinner();
        for (const event of fresh) {
          if (json) {
            writeJson(client, event);
          } else {
            printEvent(event);
          }
        }
      }

      const latest = events.at(-1)?.timestamp;
      if (latest) {
        const latestDate = new Date(latest);
        if (latestDate.getTime() > watermark.getTime()) {
          watermark = latestDate;
          watermarkSeen = countByKey(
            events.filter(event => event.timestamp === latest)
          );
        } else {
          watermarkSeen = countByKey(events);
        }
      }
      if (!abortController.signal.aborted) {
        output.spinner(`Watching ${getExperimentIdentifier(experiment)}…`);
      }
    }
  } finally {
    clearTimeout(deadline);
    process.removeListener('SIGINT', onSigint);
    output.stopSpinner();
  }
  return 0;
}

export default async function runDiagnose(
  client: Client,
  argv: string[]
): Promise<number> {
  const parsed = parseSubcommand(argv, diagnoseSubcommand);
  if (!parsed) return 2;
  const jsonOutput = isJson(parsed.flags);
  const fail = (result: ValidationError) =>
    handleValidationError(result, jsonOutput, client);

  // A tail runs until interrupted, so an end time would be honoured by the
  // backfill and then immediately overrun. `--since` is fine: it bounds where
  // the backfill starts, which the tail then continues from.
  if (parsed.flags['--follow'] && parsed.flags['--until'] !== undefined) {
    return fail({
      valid: false,
      code: 'MUTUAL_EXCLUSIVITY',
      message: `The ${chalk.bold('--follow')} option reads until interrupted, so it cannot be combined with ${chalk.bold('--until')}.`,
    });
  }

  const limit = validateIntegerRangeWithDefault(
    parsed.flags['--limit'] as number | undefined,
    {
      flag: '--limit',
      min: 1,
      max: MAX_DIAGNOSE_EVENTS,
      defaultValue: DEFAULT_DIAGNOSE_EVENTS,
    }
  );
  if (!limit.valid) return fail(limit);
  const since = validateTimeBound(
    parsed.flags['--since'] as string | undefined
  );
  if (!since.valid) return fail(since);
  const until = validateTimeBound(
    parsed.flags['--until'] as string | undefined
  );
  if (!until.valid) return fail(until);
  const order = validateTimeOrder(since.value, until.value);
  if (!order.valid) return fail(order);

  const context = await fetchExperimentContext(
    client,
    parsed,
    'experiments diagnose <experiment>'
  );
  if (typeof context === 'number') return context;
  const { experiment, link } = context;

  const names = metricEventNames(experiment);
  const requestedEvents = normalizeRepeatableStringFilters(
    parsed.flags['--event'] as string[] | undefined
  );
  const unknownEvents = requestedEvents.filter(name => !names.includes(name));
  if (unknownEvents.length > 0) {
    return fail({
      valid: false,
      code: 'UNKNOWN_METRIC_EVENT',
      message: `This experiment has no metric event named ${unknownEvents
        .map(name => `"${name}"`)
        .join(', ')}. Choose from: ${names.join(', ') || '(none configured)'}.`,
      allowedValues: names,
    });
  }

  // Naming neither kind means both, so the common case needs no flags at all.
  const wantsExposures =
    Boolean(parsed.flags['--exposures']) || requestedEvents.length === 0;
  const eventNames =
    requestedEvents.length > 0
      ? requestedEvents
      : parsed.flags['--exposures']
        ? []
        : names;

  const limitValue = limit.value;
  const end = until.value ?? new Date();
  const window = {
    start: toWholeSecondIso(since.value ?? defaultRangeStart(experiment, end)),
    end: toWholeSecondIso(end),
  };

  // The unit lives inside the stored JSON rather than in a column, so it is
  // matched as a glob over `eventData`. Unit values are random 21-character
  // ids, so a coincidental match elsewhere in the payload is not a practical
  // concern.
  const unitValue =
    typeof parsed.flags['--unit'] === 'string' ? parsed.flags['--unit'] : '';
  const unitClause = unitValue
    ? ` AND eventData:*${unitValue.replaceAll('*', '')}*`
    : '';

  const branches = [
    wantsExposures
      ? `type:exposure AND eventName:${quoteFilterValue(experiment.id)}${unitClause}`
      : undefined,
    eventNames.length > 0
      ? `type:event AND eventName:(${eventNames
          .map(quoteFilterValue)
          .join(' OR ')})${unitClause}`
      : undefined,
  ].filter((branch): branch is string => branch !== undefined);

  if (branches.length === 0) {
    output.error(
      'Nothing selected. Drop --exposures, or name a metric event with --event.'
    );
    return 1;
  }

  // Both kinds live in one event, so one read returns them already interleaved
  // and the page is a true time-ordered stream rather than two lists stitched
  // together. The tail reuses the same filter.
  const followFilter =
    branches.length === 1
      ? branches[0]
      : branches.map(branch => `(${branch})`).join(' OR ');

  let diagnosis: ExperimentDiagnosis;
  try {
    output.spinner('Reading experiment events…');
    const projectId = await resolveAnalyticsProjectId(
      client,
      link.org.id,
      link.project.id
    );
    const rows =
      (
        await queryAnalyticsEvents(client, link.org.id, projectId, {
          filter: followFilter,
          select: ['type', 'eventName', 'eventData'],
          ...window,
          limit: limitValue,
        })
      ).events ?? [];

    const declaredUnitKey = rows
      .map(row => parseEventData(row.eventData).unitKey)
      .find((key): key is string => typeof key === 'string');
    const unitField = unitFieldFromKey(
      declaredUnitKey ?? unitKeyFromBase(experiment)
    );

    const events = rows.map(row =>
      toDiagnosedEvent(
        row,
        row.type === 'exposure' ? 'exposure' : 'event',
        unitField
      )
    );

    const exposures = events.filter(event => event.kind === 'exposure');
    // `analyze` counts only units the experiment enrolled, so a unit assigned
    // for any other reason is reported separately rather than as enrolled.
    const enrolled = exposures.filter(
      event => event.assignmentReason === undefined
    );

    diagnosis = {
      events,
      projectId,
      exposureCount: exposures.length,
      metricEventCount: events.length - exposures.length,
      enrolledUnits: new Set(enrolled.map(event => event.unit).filter(Boolean))
        .size,
      notEnrolledExposures: exposures.length - enrolled.length,
      metricEventNames: names,
      unitField,
      truncated: rows.length >= limitValue,
      staleRampExposures: experiment.rampId
        ? exposures.filter(
            event =>
              event.rampId !== undefined && event.rampId !== experiment.rampId
          ).length
        : 0,
      window,
    };
    output.stopSpinner();
  } catch (error) {
    output.stopSpinner();
    printDiagnoseError(client, error, jsonOutput);
    return 1;
  }

  if (jsonOutput) {
    writeJson(client, {
      status: 'success',
      experiment: {
        id: experiment.id,
        slug: experiment.slug,
        state: experiment.state,
        rampId: experiment.rampId,
      },
      diagnosis: diagnosis as unknown as JSONObject,
    });
  } else {
    printExperimentDiagnosis(experiment, diagnosis, {
      follow: Boolean(parsed.flags['--follow']),
    });
  }

  if (parsed.flags['--follow']) {
    // The page above is ordered newest first; the tail resumes from its newest
    // row so nothing between the two reads is skipped.
    const newest = diagnosis.events[0]?.timestamp;
    const from = newest ? new Date(newest) : new Date(diagnosis.window.end);
    const seen = newest
      ? countByKey(diagnosis.events.filter(event => event.timestamp === newest))
      : new Map<string, number>();
    output.spinner(`Watching ${getExperimentIdentifier(experiment)}…`);
    return followExperimentEvents({
      client,
      experiment,
      ownerId: link.org.id,
      projectId: diagnosis.projectId,
      filter: followFilter,
      unitField: diagnosis.unitField,
      from,
      seen,
      json: jsonOutput,
      printedSoFar: diagnosis.events.length,
    });
  }
  return 0;
}

/**
 * Explains the two refusals a diagnose read can hit.
 *
 * Both arrive as a bare `Forbidden`/`Payment Required` with no detail, so the
 * cause has to be named here or the caller is left guessing.
 */
/**
 * Sleeps, returning early when the signal aborts, so Ctrl-C during a wait exits
 * at once instead of after the remaining interval.
 *
 * The listener is removed on both paths. `{ once: true }` only removes it when
 * it fires, so every poll the timer wins would leave one attached for the life
 * of the tail.
 */
function sleepUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const settle = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', settle);
      resolve();
    };
    const timer = setTimeout(settle, ms);
    signal.addEventListener('abort', settle, { once: true });
  });
}

function printDiagnoseError(
  client: Client,
  error: unknown,
  json: boolean
): void {
  if (
    isAPIError(error) &&
    error.status === 403 &&
    error.serverMessage === EXPERIMENTS_NOT_ENABLED_MESSAGE
  ) {
    printExperimentError(client, error, json);
    return;
  }
  if (isAPIError(error) && error.status === 402) {
    output.error(
      'Reading custom events and experiment exposures requires a Pro or Enterprise plan.'
    );
    return;
  }
  if (isAPIError(error) && error.status === 403) {
    output.error(
      'Cannot read experiment exposures. Web Analytics must be enabled for the project, and exposures are behind the `web-analytics-exposure-events` flag.'
    );
    return;
  }
  printExperimentError(client, error, json);
}

function countByKey(events: readonly DiagnosedEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = diagnosedEventKey(event);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Identifies a row well enough to recognise it across two polls.
 *
 * Timestamps are whole seconds, so a poll starting at the watermark re-reads
 * that second. Genuine duplicates exist -- one unit can be exposed several
 * times within a second -- so the boundary is de-duplicated by counting
 * occurrences rather than by presence, which would drop the repeats.
 */
function diagnosedEventKey(event: DiagnosedEvent): string {
  return [
    event.timestamp,
    event.kind,
    event.name ?? '',
    event.unit ?? '',
    event.variantId ?? '',
  ].join('\u0000');
}

/** Drops the occurrences already printed at the watermark second. */
function withoutSeen(
  events: readonly DiagnosedEvent[],
  seen: Map<string, number>
): DiagnosedEvent[] {
  const remaining = new Map(seen);
  const fresh: DiagnosedEvent[] = [];
  for (const event of events) {
    const key = diagnosedEventKey(event);
    const outstanding = remaining.get(key) ?? 0;
    if (outstanding > 0) {
      remaining.set(key, outstanding - 1);
      continue;
    }
    fresh.push(event);
  }
  return fresh;
}

/**
 * `vercel.analytics` stores second-resolution timestamps and rejects a window
 * carrying milliseconds.
 */
function toWholeSecondIso(date: Date): string {
  const truncated = new Date(date);
  truncated.setUTCMilliseconds(0);
  return truncated.toISOString();
}

function toDiagnosedEvent(
  row: AnalyticsEventRow,
  kind: DiagnosedEvent['kind'],
  unitField: string
): DiagnosedEvent {
  const payload = parseEventData(row.eventData);
  const pick = (key: string): string | undefined =>
    typeof payload[key] === 'string' ? (payload[key] as string) : undefined;
  // An exposure's `eventName` only ever repeats the experiment ID, so the unit
  // and the assignment carry the diagnostic value instead.
  const unit = kind === 'exposure' ? pick('unitValue') : pick(unitField);
  const variantId = pick('variantId');
  const rampId = pick('rampId');
  const assignmentReason = pick('assignmentReason');
  return {
    timestamp: row.timestamp,
    kind,
    ...(kind === 'event' && row.eventName ? { name: row.eventName } : {}),
    ...(unit ? { unit } : {}),
    ...(variantId ? { variantId } : {}),
    ...(rampId ? { rampId } : {}),
    ...(assignmentReason && assignmentReason !== 'experiment'
      ? { assignmentReason }
      : {}),
    ...(Object.keys(payload).length > 0 ? { payload } : {}),
  };
}

function parseEventData(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Strips the `event_data.` prefix an exposure's `unitKey` carries. */
function unitFieldFromKey(unitKey: string): string {
  return unitKey.startsWith('event_data.')
    ? unitKey.slice('event_data.'.length)
    : unitKey;
}

function metricEventNames(experiment: Experiment): string[] {
  const names = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.length > 0) names.add(value);
  };
  for (const metric of Object.values(experiment.metrics ?? {})) {
    add(metric.eventName);
    add(metric.initialEvent);
    add(metric.goalEvent);
    add(metric.numeratorEvent);
    add(metric.denominatorEvent);
    if (Array.isArray(metric.eventNames)) metric.eventNames.forEach(add);
  }
  return [...names];
}

function quoteFilterValue(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

/**
 * Defaults the window to the experiment's own lifetime.
 *
 * Without `--since` the page starts at launch rather than a fixed lookback,
 * because rows before launch cannot belong to the experiment. The lookback
 * still caps it, since Web Analytics retention is shorter than some
 * experiments run.
 */
function defaultRangeStart(experiment: Experiment, end: Date): Date {
  const launchedAt = experiment.launchedAt ?? experiment.createdAt;
  return new Date(Math.max(launchedAt, end.getTime() - DIAGNOSE_LOOKBACK_MS));
}
