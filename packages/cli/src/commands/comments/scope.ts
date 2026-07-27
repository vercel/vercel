import { spawnSync } from 'node:child_process';
import type Client from '../../util/client';
import getScope from '../../util/get-scope';
import { getLinkedProject } from '../../util/projects/link';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound, isAPIError } from '../../util/errors-ts';
import { outputError } from '../../util/command-validation';
import type { BranchFocus, CommentsScope } from './types';

/**
 * Resolve the team (and optionally project) for a comments command.
 *
 * Precedence: explicit --project (resolved against the current team scope),
 * then the linked project. Thread-scoped commands only need a team, so they
 * pass `requireProject: false` and fall back to the current team scope.
 */
/** Whether the user passed an explicit scope flag on the command line. */
function scopeIsExplicit(client: Client): boolean {
  return client.argv.some(
    arg =>
      arg === '--scope' ||
      arg === '-S' ||
      arg.startsWith('--scope=') ||
      arg === '--team' ||
      arg.startsWith('--team=') ||
      arg === '-T'
  );
}

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
  if (opts.urlTeamSlug && !opts.project && !scopeIsExplicit(client)) {
    // The API accepts team slugs directly.
    return { teamId: opts.urlTeamSlug, teamSlug: opts.urlTeamSlug };
  }

  if (opts.project) {
    const { team } = await getScope(client);
    if (!team) {
      return outputError(
        client,
        opts.jsonOutput,
        'NO_TEAM',
        'No team context found. Run `vercel switch` to select a team, or run `vercel link` in a project directory.'
      );
    }

    let project: Awaited<ReturnType<typeof getProjectByNameOrId>>;
    try {
      project = await getProjectByNameOrId(client, opts.project, team.id);
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

    if (project instanceof ProjectNotFound) {
      return outputError(
        client,
        opts.jsonOutput,
        'PROJECT_NOT_FOUND',
        `Project "${opts.project}" was not found in team "${team.slug}".`
      );
    }

    return {
      teamId: team.id,
      teamSlug: team.slug,
      projectId: project.id,
      projectName: project.name,
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
    if (scopeIsExplicit(client)) {
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
