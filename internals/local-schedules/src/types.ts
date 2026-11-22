// See ../README.md for management, dispatch, and timing semantics.
export type ScheduleExpression =
  | { type: 'cron'; cron: string }
  | { type: 'single'; at: string };

export type ScheduleRequestMethod = 'GET' | 'POST';

export type ScheduleTarget =
  | { type: 'queue'; topic: string }
  | { type: 'function'; function: string }
  | { type: 'path'; path: string; requestMethod?: ScheduleRequestMethod };

export interface ScheduleIdentifier {
  name: string;
  namespace?: string;
}

export interface ScheduleDefinition {
  expression: ScheduleExpression;
  timezone?: string;
  /** Integer minutes, 1–15. Omit to disable jitter. */
  jitter?: number;
  target: ScheduleTarget;
  payload?: unknown;
}

export interface ScheduleScope {
  ownerId: string;
  projectId: string;
  trackId: string;
}

export interface Schedule extends Omit<ScheduleScope, 'trackId'> {
  scheduleId: string;
  name: string;
  namespace: string;
  expression: ScheduleExpression;
  timezone: string;
  jitter?: number;
  target: ScheduleTarget;
  state: 'active' | 'inactive';
  /** Unix ms when an active schedule is disabled again. Absent when it stays active. */
  activeUntil?: number;
  source: 'static' | 'dynamic';
  createdAt: number;
  updatedAt: number;
}

/** Management API input, after the SDK has expanded { topic } to a queue target. */
export interface CreateScheduleInput extends ScheduleDefinition {
  name?: string;
  namespace?: string;
  target: Extract<ScheduleTarget, { type: 'queue' }>;
}

export type StaticScheduleInput = Omit<ScheduleDefinition, 'payload'> &
  ScheduleIdentifier;

export interface UpdateScheduleInput {
  expression?: ScheduleExpression;
  timezone?: string;
  jitter?: number | null;
  target?: Extract<ScheduleTarget, { type: 'queue' }>;
  /** null clears the payload; undefined leaves it unchanged. */
  payload?: unknown;
}

export interface ScheduleQueueMessage {
  scheduleId: string;
  executionId: string;
  name: string;
  namespace: string;
  scheduledAt: string;
  /** The cron expression, or the local datetime of a single-fire schedule. */
  expression: string;
  source: Schedule['source'];
  payload?: unknown;
}

export interface ScheduleDispatch {
  schedule: Schedule;
  /** Stable for this occurrence; a downstream retry must reuse this value. */
  occurrenceId: string;
  scheduledAt: string;
  invokeSource: 'scheduled' | 'manual';
  signal: AbortSignal;
  delivery:
    | { type: 'queue'; topic: string; message: ScheduleQueueMessage }
    | {
        type: 'function';
        function: string;
        headers: Record<string, string>;
      }
    | {
        type: 'path';
        path: string;
        requestMethod: ScheduleRequestMethod;
        /** CloudEvent and legacy Cron Job headers, without `authorization`. */
        headers: Record<string, string>;
      };
}

export type ScheduleBrokerErrorCode =
  | 'invalid_request'
  | 'invalid_cron_expression'
  | 'jitter_exceeds_cadence'
  | 'single_at_in_past'
  | 'active_until_in_past'
  | 'not_found'
  | 'conflict'
  | 'static_schedule'
  | 'schedule_type_change_not_allowed'
  | 'schedule_single_at_passed'
  | 'schedule_already_active'
  | 'closed';

export class ScheduleBrokerError extends Error {
  constructor(
    readonly code: ScheduleBrokerErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ScheduleBrokerError';
  }
}
