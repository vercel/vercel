import { existsSync } from 'fs';
import { join } from 'path';

export type ProjectMode = 'auto' | 'linked-project' | 'no-linked-project';

export interface EvalRunContext {
  /** Absolute path to the evals directory (packages/cli/evals). */
  cwd: string;
  /** Absolute path to the sandbox project directory used by CLI evals. */
  sandboxProjectDir: string;
  /**
   * Desired project mode.
   * - 'auto' (default): infer from filesystem
   * - 'linked-project': require a linked project
   * - 'no-linked-project': run without a linked project
   */
  projectMode: ProjectMode;
}

export interface SetupResult {
  /** Final resolved mode after inspecting the sandbox project. */
  resolvedProjectMode: Exclude<ProjectMode, 'auto'>;
  /** Whether a linked project configuration was detected. */
  hasLinkedProject: boolean;
}

export interface EvalVariant {
  /** Stable identifier used in logs and result tagging. */
  id: string;
  /** Project mode to apply for this variant. */
  projectMode: ProjectMode;
}

/**
 * Parse project-mode variants from CLI_EVAL_PROJECT_MODES, or fall back to a
 * single "default" variant using the provided default mode.
 *
 * Example:
 *   CLI_EVAL_PROJECT_MODES=linked-project,no-linked-project
 * becomes:
 *   [{ id: 'linked-project', projectMode: 'linked-project' },
 *    { id: 'no-linked-project', projectMode: 'no-linked-project' }]
 */
export function getProjectModeVariantsFromEnv(
  defaultMode: ProjectMode = 'auto'
): EvalVariant[] {
  const raw = process.env.CLI_EVAL_PROJECT_MODES;
  if (!raw) {
    return [{ id: 'default', projectMode: defaultMode }];
  }

  const parts = raw
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);

  const validModes: ProjectMode[] = [
    'auto',
    'linked-project',
    'no-linked-project',
  ];
  const variants: EvalVariant[] = [];

  for (const part of parts) {
    if ((validModes as string[]).includes(part)) {
      variants.push({ id: part, projectMode: part as ProjectMode });
    }
  }

  if (variants.length === 0) {
    return [{ id: 'default', projectMode: defaultMode }];
  }

  return variants;
}

/**
 * Setup hook for CLI evals. Detects whether the sandbox project is linked and
 * resolves the effective project mode.
 *
 * This is intentionally lightweight; future PRs can extend it to create or
 * unlink projects based on the resolved mode.
 */
export async function setup(
  context: EvalRunContext
): Promise<SetupResult | void> {
  const projectJson = join(
    context.sandboxProjectDir,
    '.vercel',
    'project.json'
  );
  const configJson = join(context.sandboxProjectDir, '.vercel', 'config.json');
  const hasLinkedProject = existsSync(projectJson) || existsSync(configJson);

  if (context.projectMode === 'linked-project' && !hasLinkedProject) {
    throw new Error(
      `CLI evals setup expected a linked project in ${context.sandboxProjectDir}, but no .vercel/project.json or .vercel/config.json was found.`
    );
  }

  let resolvedProjectMode: Exclude<ProjectMode, 'auto'>;
  if (context.projectMode === 'auto') {
    resolvedProjectMode = hasLinkedProject
      ? 'linked-project'
      : 'no-linked-project';
  } else {
    resolvedProjectMode = context.projectMode;
  }

  return { resolvedProjectMode, hasLinkedProject };
}

/**
 * Destroy hook for CLI evals. Currently a no-op placeholder so future PRs can
 * clean up resources created during setup or eval execution.
 */
export async function destroy(
  _context: EvalRunContext,
  _setupResult: SetupResult | void
): Promise<void> {
  void _context;
  void _setupResult;
  // Intentionally empty; reserved for future cleanup behavior.
}
