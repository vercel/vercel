import type { ProposePlanInput, ToolPart } from './types';
import { toolName } from './stream';

const SUMMARY_KEYS = [
  'description',
  'command',
  'args',
  'query',
  'path',
  'url',
  'pattern',
  'title',
  'domain',
  'name',
];

/** Short human summary of a tool call, e.g. `Bash(vercel inspect --logs)`. */
export function summarizeTool(part: ToolPart, width = 60): string {
  const input = (part.input ?? {}) as Record<string, unknown>;
  const value = SUMMARY_KEYS.map(k => input[k]).find(
    v => typeof v === 'string' || Array.isArray(v)
  );
  let arg = Array.isArray(value)
    ? value.join(' ')
    : ((value as string | undefined) ?? '');
  arg = arg.replace(/\s+/g, ' ').trim();
  if (arg.length > width) arg = `${arg.slice(0, width - 1)}…`;
  return `${toolName(part)}(${arg})`;
}

export function formatPlan(plan: ProposePlanInput): string {
  const lines = [`## Plan: ${plan.title}`];
  if (plan.summary) lines.push('', plan.summary);
  lines.push('');
  for (const task of plan.tasks) {
    const scopes = task.scopes?.length ? ` _(${task.scopes.join(', ')})_` : '';
    lines.push(`- ${task.title}${scopes}`);
    if (task.description) lines.push(`  ${task.description}`);
  }
  return lines.join('\n');
}
