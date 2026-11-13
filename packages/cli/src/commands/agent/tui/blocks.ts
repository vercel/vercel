import type { AgentMessage, ToolPart } from '../types';
import type { PlanProgress } from './plan';
import { isToolPart, toolName } from '../stream';
import { applyPlanPart } from './plan';

/** How a message renders: answers, thinking, and tool calls grouped between them. */
export type Block =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'thinking'; key: string; text: string; active: boolean }
  | { kind: 'tools'; key: string; parts: ToolPart[]; active: boolean }
  /** An approved plan, or its final state, shown as a checklist. */
  | { kind: 'plan'; key: string; part: ToolPart; plan: PlanProgress }
  /** A plan waiting for the user's decision. */
  | { kind: 'approval'; key: string; part: ToolPart };

/** Plan milestones get their own block. Task updates show in the live checklist instead. */
function planMilestone(part: ToolPart): boolean {
  const name = toolName(part);
  return (
    (name === 'ProposePlan' && part.state === 'output-available') ||
    name === 'CompletePlan' ||
    name === 'FailPlan'
  );
}

/**
 * Split a message into blocks. With `live`, the last block is still in progress: its tool group
 * stays open and its thinking shows as active; everything before it has "moved on".
 */
export function toBlocks(
  message: AgentMessage,
  live: boolean,
  planBefore?: PlanProgress
): Block[] {
  const blocks: Block[] = [];
  let plan = planBefore;
  message.parts.forEach((part, i) => {
    plan = applyPlanPart(plan, part);
    const key = `${message.id}:${i}`;
    if (isToolPart(part)) {
      if (
        toolName(part) === 'ProposePlan' &&
        part.state === 'approval-requested'
      )
        return blocks.push({ kind: 'approval', key, part });
      if (planMilestone(part) && plan)
        return blocks.push({ kind: 'plan', key, part, plan });
      if (toolName(part) === 'UpdatePlanTask') return;
      const last = blocks.at(-1);
      if (last?.kind === 'tools') return last.parts.push(part);
      return blocks.push({
        kind: 'tools',
        key,
        parts: [part],
        active: false,
      });
    }
    const text = 'text' in part ? String(part.text).trim() : '';
    if (!text) return;
    if (part.type === 'text') {
      blocks.push({ kind: 'text', key, text });
    } else if (part.type === 'reasoning') {
      blocks.push({
        kind: 'thinking',
        key,
        text,
        active: false,
      });
    }
  });
  const last = blocks.at(-1);
  if (live && (last?.kind === 'tools' || last?.kind === 'thinking'))
    last.active = true;
  return blocks;
}

/** `4 tool calls · Read, Bash ×3`: names in first-use order with counts. */
export function summarizeGroup(parts: ToolPart[]): {
  label: string;
  names: string;
  failed: number;
} {
  const counts = new Map<string, number>();
  for (const part of parts)
    counts.set(toolName(part), (counts.get(toolName(part)) ?? 0) + 1);
  const names = [...counts]
    .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
    .join(', ');
  return {
    label: `${parts.length} tool call${parts.length === 1 ? '' : 's'}`,
    names,
    failed: parts.filter(p => p.state === 'output-error').length,
  };
}
