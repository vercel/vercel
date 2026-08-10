import { readFile } from 'node:fs/promises';
import missionTemplate from './mission.md';

/**
 * Values substituted into the instructions template before the prompt is handed
 * to a harness. Keep this surface small: the template is meant to be edited as
 * prose, not turned into a templating language.
 */
export interface MissionContext {
  /** Absolute path to the directory the harness is scoped to. */
  workspace: string;
  /** Preflight summary describing the Vercel CLI state. */
  vercelContext: string;
}

const PLACEHOLDER = {
  workspace: '{{WORKSPACE}}',
  vercelContext: '{{VERCEL_CONTEXT}}',
} as const;

/**
 * Render the built-in mission instructions with the current environment.
 */
export function renderMission(context: MissionContext): string {
  return render(missionTemplate, context);
}

/**
 * Render instructions loaded from a user-supplied file. Used by `--prompt` so a
 * variant can be exercised without rebuilding the CLI.
 */
export async function renderMissionFromFile(
  path: string,
  context: MissionContext
): Promise<string> {
  const template = await readFile(path, 'utf-8');
  return render(template, context);
}

function render(template: string, context: MissionContext): string {
  return template
    .split(PLACEHOLDER.workspace)
    .join(context.workspace)
    .split(PLACEHOLDER.vercelContext)
    .join(context.vercelContext);
}
