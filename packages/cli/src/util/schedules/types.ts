import type { JSONValue } from '@vercel-internals/types';

export type ScheduleExpression =
  | { type: 'cron'; cron: string }
  | { type: 'single'; at: string };

export type ScheduleTarget =
  | { type: 'function'; function: string; service?: string }
  | { type: 'path'; path: string; requestMethod?: 'GET' | 'POST' }
  | { type: 'queue'; topic: string };

export type ScheduleState = 'active' | 'inactive';

export type ScheduleSource = 'static' | 'dynamic';

export interface Schedule {
  scheduleId: string;
  ownerId: string;
  projectId: string;
  name: string;
  namespace: string;
  timezone: string;
  expression: ScheduleExpression;
  jitter?: number;
  target: ScheduleTarget;
  state: ScheduleState;
  /** Unix ms when a schedule enabled with an end time is disabled again. */
  activeUntil?: number;
  source: ScheduleSource;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduleIdentifier {
  name: string;
  namespace?: string;
}

export interface EnableScheduleParams extends ScheduleIdentifier {
  /** Unix ms to keep the schedule enabled until. */
  activeUntil?: number;
}

export interface CreateScheduleParams extends ScheduleIdentifier {
  expression: ScheduleExpression;
  timezone?: string;
  jitter?: number;
  target: { topic: string };
  payload?: JSONValue;
}

export interface UpdateScheduleParams extends ScheduleIdentifier {
  expression?: ScheduleExpression;
  timezone?: string;
  jitter?: number | null;
  target?: { topic: string };
  payload?: JSONValue;
}

export interface ListSchedulesParams {
  namespace?: string;
  cursor?: string;
  limit?: number;
}

export interface ListSchedulesResponse {
  data: Schedule[];
  cursor: string | null;
}

export interface DeleteScheduleResponse {
  scheduleId: string;
}

export type ScheduleExecutionInvokeSource = 'manual' | 'scheduled';

export type ScheduleExecutionStatus = 'succeeded' | 'failed' | 'unavailable';

export interface ScheduleExecution {
  executionId: string;
  invokeSource?: ScheduleExecutionInvokeSource;
  status: ScheduleExecutionStatus;
  firedAt: number | null;
}

export interface ScheduleExecutionMetrics {
  from: number;
  to: number;
  recordedInvocations: number;
  failedInvocations: number;
  errorRate: number | null;
  averageDurationMs: number | null;
}

export interface ListExecutionsParams extends ScheduleIdentifier {
  cursor?: string;
  limit?: number;
  sort?: 'asc' | 'desc';
  from?: number;
  to?: number;
  executionId?: string;
}

export interface ListExecutionsResponse {
  data: ScheduleExecution[];
  cursor: string | null;
  metrics: ScheduleExecutionMetrics;
}
