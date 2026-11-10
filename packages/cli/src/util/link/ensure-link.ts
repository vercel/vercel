import { getPlatformEnv } from '@vercel/build-utils';
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
import {
  outputActionRequired,
  outputAgentError,
  buildCommandWithYes,
} from '../agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../agent-output-constants';
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
  /** Fetches the project without fetching its owner; the org slug is empty. */
  skipOwnerLookup?: boolean;
  /** Uses local link metadata without fetching the owner or project. */
  skipRemoteLookup?: boolean;
  /**
   * Command that would create a missing `projectName` when `createIfNotFound`
   * is off. The not-found error offers it, with a similar-name suggestion and
   * the note on filling its placeholders.
   */
  createCommand?: { command: string; note?: string };
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
  if (!opts.singleFile) cwd = await resolveProjectCwd(cwd);

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
      // and the repo-linked project is ambiguous).
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
        skipOwnerLookup: opts.skipOwnerLookup,
        skipRemoteLookup: opts.skipRemoteLookup,
        skipProjectRootResolution: Boolean(opts.singleFile),
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
    // `createIfNotFound` creates a missing name instead, never a missing ID.
    if (
      link.status === 'not_linked' &&
      opts.failIfNotFound &&
      opts.projectName
    ) {
      // A `--project` equal to `VERCEL_PROJECT_ID` agrees with the pin, so
      // the pinned project itself is what's missing.
      const pinnedProjectId = getPlatformEnv('PROJECT_ID');
      const creatable =
        !opts.projectName.startsWith('prj_') && !pinnedProjectId;
      if (
        !opts.createIfNotFound ||
        opts.projectName.startsWith('prj_') ||
        pinnedProjectId === opts.projectName
      ) {
        await printProjectNotFoundError(
          client,
          opts.projectName,
          commandName,
          link.orgId,
          { createCommand: creatable ? opts.createCommand : undefined }
        );
        return 1;
      }

      // A new project can never be the one `VERCEL_PROJECT_ID` names, and a
      // `--project` that disagrees with it is a usage error.
      if (pinnedProjectId) {
        const message = `Can't use --project with VERCEL_PROJECT_ID. --project is "${opts.projectName}" and VERCEL_PROJECT_ID is "${pinnedProjectId}". Remove one of them.`;
        const helpCommand = getCommandNamePlain(`${commandName} --help`);
        output.error(`${message}\n\nSee all options:\n  ${helpCommand}`);
        outputAgentError(client, {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message,
          next: [{ command: helpCommand, when: 'see all options' }],
        });
        return 2;
      }
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
