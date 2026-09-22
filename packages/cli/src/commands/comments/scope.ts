import { spawnSync } from 'node:child_process';
import type Client from '../../util/client';
import getScope, { detectExplicitScope } from '../../util/get-scope';
import { getLinkedProject } from '../../util/projects/link';
import { resolveProjectContext } from '../../util/projects/resolve-project-context';
import { isAPIError } from '../../util/errors-ts';
import { outputError, writeJsonError } from '../../util/command-validation';
import type { BranchFocus, CommentsScope } from './types';

/**
 * Resolve the team (and optionally project) for a comments command.
 *
 * Precedence: explicit --project (resolved from local metadata before the
 * current team), then the linked project. Thread-scoped commands only need a
 * team, so they pass `requireProject: false` and fall back to the current team.
 */
export async function resolveCommentsScope(
  client: Client,
  opts: {
    project?: string;
    requireProject: boolean;
    jsonOutput: boolean;
    /** Team slug parsed from a pasted dashboard webUrl (see threads.ts). */
    urlTeamSlug?: string;
  }
): Promise<CommentsScope | number> {
  // Precedence: explicit flags (--project / --scope) beat the URL's team,
  // which beats the linked project, which beats the current default team.
  if (opts.urlTeamSlug && !opts.project && !detectExplicitScope(client)) {
    // The API accepts team slugs directly.
    return { teamId: opts.urlTeamSlug, teamSlug: opts.urlTeamSlug };
  }

  if (opts.project) {
    let context: Awaited<ReturnType<typeof resolveProjectContext>>;
    try {
      context = await resolveProjectContext({
        client,
        projectNameOrId: opts.project,
        projectNotFoundHandling: opts.jsonOutput ? 'return' : 'report',
      });
    } catch (err) {
      if (isAPIError(err)) {
        return outputError(
          client,
          opts.jsonOutput,
          err.code || 'API_ERROR',
          err.serverMessage || `API error (${err.status}).`
        );
      }
      throw err;
    }
    if (context.status === 'error') {
      if (opts.jsonOutput) {
        writeJsonError(
          client,
          'PROJECT_CONTEXT_ERROR',
          'Could not resolve the project context.'
        );
      }
      return context.exitCode;
    }
    if (context.status === 'not_linked') {
      return outputError(
        client,
        opts.jsonOutput,
        'PROJECT_NOT_FOUND',
        `Project "${opts.project}" was not found in the current scope.`
      );
    }

    return {
      teamId: context.org.id,
      teamSlug: context.org.slug,
      projectId: context.project.id,
      projectName: context.project.name,
      linked: Boolean(context.repoRoot),
    };
  }

  const linked = await getLinkedProject(client);
  if (linked.status === 'error') {
    return linked.exitCode;
  }

  if (linked.status === 'linked') {
    // An explicit --scope must beat the linked directory (documented
    // precedence). Keep the linked project only when it belongs to the
    // explicitly selected team.
    if (detectExplicitScope(client)) {
      const { team } = await getScope(client);
      if (!team) {
        return outputError(
          client,
          opts.jsonOutput,
          'NO_TEAM',
          'No team context found for --scope.'
        );
      }
      if (team.id !== linked.org.id) {
        if (opts.requireProject) {
          return outputError(
            client,
            opts.jsonOutput,
            'SCOPE_PROJECT_MISMATCH',
            `--scope ${team.slug} does not match the linked project's team (${linked.org.slug}). Pass --project <name-or-id> for a project in ${team.slug}.`
          );
        }
        return { teamId: team.id, teamSlug: team.slug };
      }
    }
    return {
      teamId: linked.org.id,
      teamSlug: linked.org.slug,
      projectId: linked.project.id,
      projectName: linked.project.name,
      linked: true,
    };
  }

  if (opts.requireProject) {
    return outputError(
      client,
      opts.jsonOutput,
      'NOT_LINKED',
      'No linked project found. Run `vercel link` to link a project, or pass --project <name-or-id>.'
    );
  }

  const { team } = await getScope(client);
  if (!team) {
    return outputError(
      client,
      opts.jsonOutput,
      'NO_TEAM',
      'No team context found. Run `vercel switch` to select a team, or run `vercel link` in a project directory.'
    );
  }

  return { teamId: team.id, teamSlug: team.slug };
}

/**
 * Infer the current Git branch. Order: local git HEAD, then CI env vars
 * (CI checkouts are detached HEADs or PR merge refs). Returns undefined when
 * nothing can be inferred; callers must not silently widen scope on that.
 */
export function inferBranch(cwd: string): BranchFocus | undefined {
  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status === 0) {
    const branch = result.stdout.trim();
    if (branch && branch !== 'HEAD') {
      return { value: branch, source: 'git' };
    }
  }

  const ciRef =
    process.env.VERCEL_GIT_COMMIT_REF ||
    process.env.GITHUB_HEAD_REF ||
    process.env.GITHUB_REF_NAME;
  if (ciRef) {
    return { value: ciRef, source: 'ci' };
  }

  return undefined;
}
