import { toDisplayRunId } from './ids';
import { getRunStatus, toBranchName, type CiRunStatus } from './run-status';
import type {
  CiInvocation,
  CiInvocationTree,
  CiJobRun,
  CiRepositoryInfo,
  CiTaskRun,
} from './types';

export type CiStepStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'cached'
  | 'failed'
  | 'skipped';

export type CiRunSummary = {
  id: string;
  attempt: number;
  status: CiRunStatus;
  /** Why the run was skipped, or `setup_failed` when setup failed. */
  reason?: string;
  repository: string;
  branch: string;
  commitSha: string;
  createdAt: string;
};

export type CiTaskView = {
  name: string;
  status: CiStepStatus;
  reason?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
};

export type CiJobView = {
  name: string;
  kind: 'command' | 'turbo';
  status: CiStepStatus;
  reason?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  tasks: CiTaskView[];
};

export type CiRunView = {
  run: CiRunSummary;
  jobs: CiJobView[];
};

export function toRunSummary(
  invocation: CiInvocation,
  repositories: Record<string, CiRepositoryInfo>
): CiRunSummary {
  const repository = repositories[invocation.repositoryKey];
  return {
    id: toDisplayRunId(invocation.invocationId),
    attempt: invocation.attempt,
    status: getRunStatus(invocation),
    ...getRunReason(invocation),
    repository: repository ? `${repository.owner}/${repository.name}` : '',
    branch: toBranchName(invocation.ref),
    commitSha: invocation.commitSha,
    createdAt: toIso(invocation.createdAt),
  };
}

function getRunReason(invocation: CiInvocation): { reason?: string } {
  if (invocation.skipped) {
    return { reason: invocation.skipped.reason };
  }
  if (invocation.setupConclusion?.result === 'failed') {
    return { reason: 'setup_failed' };
  }
  return {};
}

export function toRunView(tree: CiInvocationTree): CiRunView {
  return {
    run: toRunSummary(tree.invocation, tree.repositories),
    jobs: tree.jobs.map(job => ({
      name: job.definition.name,
      kind: job.definition.kind,
      ...toStepTiming(job.run),
      tasks: job.tasks.map(task => ({
        name: task.definition.name,
        ...toStepTiming(task.run),
      })),
    })),
  };
}

function toStepTiming(run: CiJobRun | CiTaskRun | undefined): {
  status: CiStepStatus;
  reason?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
} {
  const startedAt = run?.started?.startedAt;
  const completedAt = run?.completed?.completedAt;
  const conclusion = run?.completed?.conclusion;

  let status: CiStepStatus = 'queued';
  if (conclusion) {
    status = conclusion.result;
  } else if (startedAt !== undefined) {
    status = 'running';
  }

  return {
    status,
    ...(conclusion && 'reason' in conclusion
      ? { reason: conclusion.reason }
      : {}),
    ...(startedAt !== undefined ? { startedAt: toIso(startedAt) } : {}),
    ...(completedAt !== undefined ? { completedAt: toIso(completedAt) } : {}),
    ...(startedAt !== undefined && completedAt !== undefined
      ? { durationMs: Math.max(completedAt - startedAt, 0) }
      : {}),
  };
}

function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

export function countTasks(view: CiRunView): {
  total: number;
  finished: number;
} {
  let total = 0;
  let finished = 0;
  for (const job of view.jobs) {
    for (const task of job.tasks) {
      total++;
      if (task.status !== 'queued' && task.status !== 'running') {
        finished++;
      }
    }
  }
  return { total, finished };
}
