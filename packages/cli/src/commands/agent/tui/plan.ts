import type { MessagePart, ProposePlanInput } from '../types';
import { isToolPart, toolName } from '../stream';

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface PlanProgress {
  title: string;
  tasks: { id: string; title: string; status: TaskStatus }[];
  state: 'active' | 'completed' | 'failed';
}

/**
 * Fold one message part into the plan's progress. A plan starts once `ProposePlan` succeeds
 * (approved or auto-approved), then follows `UpdatePlanTask`, `CompletePlan` and `FailPlan`.
 */
export function applyPlanPart(
  progress: PlanProgress | undefined,
  part: MessagePart
): PlanProgress | undefined {
  if (!isToolPart(part)) return progress;
  const name = toolName(part);
  if (name === 'ProposePlan' && part.state === 'output-available') {
    const input = part.input as ProposePlanInput;
    return {
      title: input.title,
      tasks: input.tasks.map(t => ({
        id: t.id,
        title: t.title,
        status: 'pending',
      })),
      state: 'active',
    };
  }
  if (
    !progress ||
    part.state === 'input-streaming' ||
    part.state === 'output-error'
  )
    return progress;
  if (name === 'UpdatePlanTask') {
    const { taskId, status } = (part.input ?? {}) as {
      taskId?: string;
      status?: TaskStatus;
    };
    return {
      ...progress,
      tasks: progress.tasks.map(t =>
        t.id === taskId && status ? { ...t, status } : t
      ),
    };
  }
  if (name === 'CompletePlan') return { ...progress, state: 'completed' };
  if (name === 'FailPlan') return { ...progress, state: 'failed' };
  return progress;
}

export function foldPlan(
  progress: PlanProgress | undefined,
  parts: MessagePart[]
): PlanProgress | undefined {
  return parts.reduce(applyPlanPart, progress);
}
