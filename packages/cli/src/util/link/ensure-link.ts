import type Client from '../client';
import param from '../output/param';
import { getCommandName, getCommandNamePlain } from '../pkg-name';
import {
  getLinkedProject,
  type ProjectLinkResultWithOrgId,
} from '../projects/link';
import { resolveProjectCwd } from '../projects/find-project-root';
import type {
  ProjectLinkResultWithGitGuidance,
  SetupAndLinkOptions,
} from '../link/setup-and-link';
import type { ProjectLinked } from '@vercel-internals/types';
import output from '../../output-manager';
import { outputActionRequired, buildCommandWithYes } from '../agent-output';
import { printProjectNotFoundError } from '../projects/project-not-found-error';
import { detectExplicitScope } from '../get-scope';

interface EnsureLinkOptions extends SetupAndLinkOptions {
  /** When true, fail instead of setting up a project that is not linked. */
  requireExistingLink?: boolean;
  /**
   * Deploy-only fallback for project-scoped tokens that can fetch the linked
   * project but cannot fetch the owner user/team resource.
   */
  allowOwnerLookupFallback?: boolean;
  /** Uses local link metadata without fetching the owner or project. */
  skipRemoteLookup?: boolean;
}

/**
 * Checks if a project is already linked and if not, links the project and
 * validates the link response. When non-interactive and an error occurs,
 * exits (process.exit); otherwise returns the linked project or a numeric
 * exit code (0 for user abort, non-zero for error).
 *
 * @param commandName - The name of the current command to print in the
 * event of an error
 * @param client - The Vercel Node.js client instance
 * @param cwd - The current working directory
 * @param opts.forceDelete - When `true`, deletes the project's `.vercel`
 * directory
 * @param opts.projectName - The project name to use when linking, otherwise
 * the current directory
 * @returns {Promise<ProjectLinked | number>} The linked project or exit code (or process exits when nonInteractive and error)
 */
export async function ensureLink(
  commandName: string,
  client: Client,
  cwd: string,
  opts: EnsureLinkOptions = {}
): Promise<
  | (ProjectLinked &
      Pick<ProjectLinkResultWithGitGuidance, 'gitConnectOffered'>)
  | number
> {
  cwd = await resolveProjectCwd(cwd);

  let link:
    | (ProjectLinkResultWithOrgId & ProjectLinkResultWithGitGuidance)
    | undefined = opts.link;
  // All commands respect global --non-interactive; link can override via opts
  const nonInteractive = opts.nonInteractive ?? client.nonInteractive ?? false;
  opts.nonInteractive = nonInteractive;
  if (!link) {
    if (opts.forceDelete) {
      // When `forceDelete` is enabled we will always run the interactive
      // setup/link flow. Avoid an eager `getLinkedProject()` call, since it can
      // trigger additional prompts (for example when `.vercel/repo.json` exists
      // and the repo-linked project is ambiguous). An explicit `--project` name
      // is still validated: `setupAndLink` -> `inputProject` throws
      // `ProjectNotFound` for it once the org is resolved (see the
      // `PROJECT_NOT_FOUND` handling below), instead of silently offering to
      // create a new project for a typo.
      link = { status: 'not_linked', org: null, project: null };
    } else {
      // `failIfNotFound` doubles as the opt-in for API-based name/ID
      // resolution: both behaviors only apply when `projectName` came from
      // an explicit user flag.
      link = await getLinkedProject(client, {
        cwd,
        projectName: opts.projectName,
        projectNameIsExplicit: Boolean(opts.projectName && opts.failIfNotFound),
        scopeIsExplicit: detectExplicitScope(client),
        allowOwnerLookupFallback: opts.allowOwnerLookupFallback,
        skipRemoteLookup: opts.skipRemoteLookup,
      });
    }
    opts.link = link;
  }

  if (
    (link.status === 'linked' && opts.forceDelete) ||
    link.status === 'not_linked'
  ) {
    // Explicit `--project` was provided but could not be resolved; bail out
    // before `setupAndLink` would offer to create a new project for a typo.
    // Skipped for `forceDelete`: its placeholder `link` is always
    // `not_linked` (see above), not a real signal, so that path is validated
    // later instead, once `setupAndLink` has resolved the org (see the
    // `PROJECT_NOT_FOUND` handling below).
    if (
      !opts.forceDelete &&
      link.status === 'not_linked' &&
      opts.failIfNotFound &&
      opts.projectName
    ) {
      await printProjectNotFoundError(
        client,
        opts.projectName,
        commandName,
        link.orgId
      );
      return 1;
    }

    if (link.status === 'not_linked' && opts.requireExistingLink) {
      output.error(
        `Project is not linked. Run ${getCommandName('link')} first.`
      );
      return 1;
    }

    const { default: setupAndLink } = await import('../link/setup-and-link');
    link = await setupAndLink(client, cwd, opts);

    if (link.status === 'not_linked') {
      // User aborted project linking questions
      return 0;
    }
  }

  if (link.status === 'error') {
    // `setupAndLink` -> `inputProject` throws `ProjectNotFound` for an
    // explicit `--project` name once the org is resolved (the `forceDelete`
    // path can't validate this earlier without duplicating org resolution;
    // see the comment above). Report it the same way as the eager check
    // above, since `setupAndLink` doesn't have `commandName` to do so itself.
    if (link.reason === 'PROJECT_NOT_FOUND' && opts.projectName) {
      await printProjectNotFoundError(
        client,
        opts.projectName,
        commandName,
        link.orgId
      );
      return 1;
    }
    if (link.reason === 'HEADLESS') {
      if (nonInteractive) {
        outputActionRequired(
          client,
          {
            status: 'action_required',
            reason: 'confirmation_required',
            message: `Command ${getCommandNamePlain(commandName)} requires confirmation. Use option --yes to confirm.`,
            next: [
              {
                command: buildCommandWithYes(client.argv),
                when: 'Confirm and run',
              },
            ],
          },
          link.exitCode
        );
      } else {
        output.error(
          `Command ${getCommandName(
            commandName
          )} requires confirmation. Use option ${param('--yes')} to confirm.`
        );
      }
    }
    if (nonInteractive) {
      process.exit(link.exitCode);
    }
    return link.exitCode;
  }

  return link;
}
