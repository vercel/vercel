import { existsSync, mkdirSync, writeFileSync } from 'fs';
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
  /** When true, experiments that support it (e.g. cli) copy the skills directory into the sandbox. */
  withSkills: boolean;
}

export interface SetupResult {
  /** Final resolved mode after inspecting the sandbox project. */
  resolvedProjectMode: Exclude<ProjectMode, 'auto'>;
  /** Whether a linked project configuration was detected. */
  hasLinkedProject: boolean;
  /** Optional ID of a project created specifically for this eval run. */
  createdProjectId?: string;
}

export interface EvalVariant {
  /** Stable identifier used in logs and result tagging. */
  id: string;
  /** Project mode to apply for this variant. */
  projectMode: ProjectMode;
  /** When true, experiments that support it (e.g. cli) copy the skills directory into the sandbox. */
  withSkills: boolean;
}

/** Project-mode-only variant (used to build full EvalVariant with getEvalVariants). */
export interface ProjectModeVariant {
  id: string;
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
): ProjectModeVariant[] {
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
  const variants: ProjectModeVariant[] = [];

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

/** Skills dimension variant: whether to copy the skills directory into the sandbox. */
export interface SkillsVariant {
  id: string;
  withSkills: boolean;
}

/**
 * Parse skills variants from CLI_EVAL_SKILLS_MODES. Default is both
 * with-skills and without-skills so the matrix runs evals with and without
 * the skills directory. Set to a single value to run only one (e.g.
 * CLI_EVAL_SKILLS_MODES=with-skills).
 *
 * Example (default): both variants.
 * Example: CLI_EVAL_SKILLS_MODES=with-skills → single variant with skills only.
 */
export function getSkillsVariantsFromEnv(): SkillsVariant[] {
  const raw = process.env.CLI_EVAL_SKILLS_MODES;
  if (!raw) {
    return [
      { id: 'with-skills', withSkills: true },
      { id: 'without-skills', withSkills: false },
    ];
  }

  const parts = raw
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);

  const valid: SkillsVariant[] = [];
  if (parts.includes('with-skills'))
    valid.push({ id: 'with-skills', withSkills: true });
  if (parts.includes('without-skills'))
    valid.push({ id: 'without-skills', withSkills: false });

  if (valid.length === 0) {
    return [
      { id: 'with-skills', withSkills: true },
      { id: 'without-skills', withSkills: false },
    ];
  }

  return valid;
}

/**
 * Return the full eval matrix: cross product of project-mode variants × skills variants.
 * Use this in the runner to get all (projectMode, withSkills) combinations.
 *
 * Example (defaults): one variant { id: 'default-with-skills', projectMode: 'auto', withSkills: true }.
 * Example (CLI_EVAL_SKILLS_MODES=with-skills,without-skills): two variants, default-with-skills and default-without-skills.
 */
export function getEvalVariants(
  defaultProjectMode: ProjectMode = 'auto'
): EvalVariant[] {
  const projectModeVariants = getProjectModeVariantsFromEnv(defaultProjectMode);
  const skillsVariants = getSkillsVariantsFromEnv();
  const variants: EvalVariant[] = [];

  for (const pm of projectModeVariants) {
    for (const sk of skillsVariants) {
      variants.push({
        id: `${pm.id}-${sk.id}`,
        projectMode: pm.projectMode,
        withSkills: sk.withSkills,
      });
    }
  }

  return variants;
}

/**
 * Create an ephemeral Vercel project via the API. Caller must set
 * VERCEL_TOKEN and CLI_EVAL_TEAM_ID. Returns project id and name; throws on failure.
 */
async function createEphemeralProject(): Promise<{
  projectId: string;
  name: string;
}> {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.CLI_EVAL_TEAM_ID;
  if (!token || !teamId) {
    throw new Error(
      'VERCEL_TOKEN and CLI_EVAL_TEAM_ID are required to create an ephemeral project.'
    );
  }

  const fetchFn = (globalThis as any).fetch as
    | ((input: string | URL, init?: RequestInit) => Promise<Response>)
    | undefined;
  if (!fetchFn) {
    throw new Error('global fetch is required to create an ephemeral project.');
  }

  const apiBase =
    process.env.VERCEL_API_URL && process.env.VERCEL_API_URL.length > 0
      ? process.env.VERCEL_API_URL
      : 'https://api.vercel.com';

  const name = `eval-cli-${Date.now()}`;
  const res = await fetchFn(
    `${apiBase}/v1/projects?teamId=${encodeURIComponent(teamId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Failed to create ephemeral project (${res.status}): ${text}`
    );
  }

  const data = (await res.json()) as { id?: string; name?: string };
  const projectId = data?.id;
  if (!projectId) {
    throw new Error('Create project response did not include project id.');
  }

  return { projectId, name: data?.name ?? name };
}

/**
 * Setup hook for CLI evals. Detects or creates a linked project:
 * - If CLI_EVAL_USE_EPHEMERAL_PROJECT=1 (or "true") and VERCEL_TOKEN/CLI_EVAL_TEAM_ID
 *   are set, creates an ephemeral project and links the sandbox to it (cleanup in destroy).
 * - Otherwise detects whether the sandbox project is linked and resolves the effective mode.
 */
export async function setup(
  context: EvalRunContext
): Promise<SetupResult | void> {
  const projectJsonPath = join(
    context.sandboxProjectDir,
    '.vercel',
    'project.json'
  );
  const configJson = join(context.sandboxProjectDir, '.vercel', 'config.json');
  let hasLinkedProject = existsSync(projectJsonPath) || existsSync(configJson);

  // Use ephemeral project when no explicit project ID is set (evals use ephemeral by default).
  const useEphemeral =
    !process.env.CLI_EVAL_PROJECT_ID &&
    Boolean(process.env.VERCEL_TOKEN && process.env.CLI_EVAL_TEAM_ID);

  let createdProjectId: string | undefined;

  if (useEphemeral) {
    const { projectId, name } = await createEphemeralProject();
    createdProjectId = projectId;
    const teamId = process.env.CLI_EVAL_TEAM_ID;
    const vercelDir = join(context.sandboxProjectDir, '.vercel');
    mkdirSync(vercelDir, { recursive: true });
    writeFileSync(
      projectJsonPath,
      JSON.stringify({ projectId, orgId: teamId, projectName: name }, null, 2),
      'utf8'
    );
    hasLinkedProject = true;
  }

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

  return {
    resolvedProjectMode,
    hasLinkedProject,
    ...(createdProjectId ? { createdProjectId } : {}),
  };
}

/**
 * Destroy hook for CLI evals. Currently a no-op placeholder so future PRs can
 * clean up resources created during setup or eval execution. If
 * `createdProjectId` is set on the SetupResult, this will attempt to delete
 * the project via the Vercel API using VERCEL_TOKEN and CLI_EVAL_TEAM_ID.
 */
export async function destroy(
  _context: EvalRunContext,
  setupResult: SetupResult | void
): Promise<void> {
  void _context;

  if (!setupResult?.createdProjectId) {
    return;
  }

  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.CLI_EVAL_TEAM_ID;
  if (!token || !teamId) {
    process.stderr.write(
      'Warning: createdProjectId is set but VERCEL_TOKEN or CLI_EVAL_TEAM_ID is missing; skipping project cleanup.\n'
    );
    return;
  }

  const fetchFn = (globalThis as any).fetch as
    | ((input: string | URL, init?: RequestInit) => Promise<Response>)
    | undefined;

  if (!fetchFn) {
    process.stderr.write(
      'Warning: createdProjectId is set but global fetch is not available; skipping project cleanup.\n'
    );
    return;
  }

  const apiBase =
    process.env.VERCEL_API_URL && process.env.VERCEL_API_URL.length > 0
      ? process.env.VERCEL_API_URL
      : 'https://api.vercel.com';

  const projectId = setupResult.createdProjectId;

  try {
    const res = await fetchFn(
      `${apiBase}/v9/projects/${encodeURIComponent(
        projectId
      )}?teamId=${encodeURIComponent(teamId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      process.stderr.write(
        `Warning: failed to delete eval project "${projectId}" (status ${res.status}): ${text}\n`
      );
    }
  } catch (err: any) {
    const message =
      err && typeof err.message === 'string'
        ? err.message
        : String(err ?? 'unknown error');
    process.stderr.write(
      `Warning: error deleting eval project "${projectId}": ${message}\n`
    );
  }
}
