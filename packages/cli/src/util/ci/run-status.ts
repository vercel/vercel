import type { CiInvocation } from './types';

export type CiRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'completed';

const FAILED_SETUP_STATUSES = new Set([
  'bootstrapping_failed',
  'jobs_on_hive_failed',
]);

export function getRunStatus(invocation: CiInvocation): CiRunStatus {
  if (invocation.runConclusion) {
    return invocation.runConclusion.result;
  }
  if (invocation.completed?.conclusion) {
    return invocation.completed.conclusion;
  }
  if (invocation.status === 'skipped') {
    return 'skipped';
  }
  if (FAILED_SETUP_STATUSES.has(invocation.status)) {
    return 'failed';
  }
  if (invocation.status === 'completed') {
    return 'completed';
  }
  if (invocation.status === 'new') {
    return 'queued';
  }
  return 'running';
}

export const CI_RUN_STATUSES: readonly CiRunStatus[] = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'skipped',
];

const RUNNING_API_STATUSES = [
  'bootstrapping',
  'snapshotted',
  'sandbox_named',
  'jobs_on_hive_clone_dispatched',
  'jobs_on_hive_dispatched',
  'jobs_on_hive_completed',
  'awaiting_jobs',
] as const;

/** Maps a CLI run status filter onto the list endpoint's query filters. */
export function toRunStatusFilter(status: CiRunStatus): {
  statuses?: readonly string[];
  conclusions?: readonly string[];
} {
  switch (status) {
    case 'queued':
      return { statuses: ['new'] };
    case 'running':
      return { statuses: RUNNING_API_STATUSES };
    case 'completed':
      return { statuses: ['completed'] };
    default:
      return { conclusions: [status] };
  }
}

export function isTerminalRunStatus(status: CiRunStatus): boolean {
  return status !== 'queued' && status !== 'running';
}

export function toBranchName(ref: string): string {
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}

export function toShortSha(sha: string): string {
  return sha.slice(0, 7);
}
