import type Client from '../client';
import getTeamByIdOrSlug from '../teams/get-team-by-id-or-slug';
import { listOrganizations } from './api';
import { handleOrganizationApiError } from './errors';
import { AGENT_REASON, AGENT_STATUS } from '../agent-output-constants';
import { outputAgentError } from '../agent-output';
import { getCommandNamePlain } from '../pkg-name';
import output from '../../output-manager';
import {
  ORGANIZATION_ID_PREFIX,
  type Validated,
  invalidArgument,
  isPrefixedId,
  invalidArgumentCount,
  missingArgument,
  slugSchema,
} from './args';

/**
 * Resolves the organization every subcommand except `list` acts on.
 *
 * Three inputs, in precedence order:
 *
 * 1. An explicit `org_…` ID, used as given.
 * 2. A slug, matched against `GET /v1/organizations`, the call that backs
 *    `organizations list`. It returns the organizations where the user has
 *    the OrgAdmin or OrgViewer permission on the root team, so a member of
 *    only a child team must pass the ID.
 * 3. Nothing, in which case the active team supplies it. `team.parentId` is the
 *    organization ID, and the API sets it on the root team and on every child,
 *    so one team lookup answers for both.
 */
export async function resolveOrganization(
  client: Client,
  args: string[],
  usage: string
): Promise<Validated<string>> {
  if (args.length > 1) {
    return { status: 'error', exitCode: invalidArgumentCount(client, usage) };
  }

  const target = args[0];
  if (target === undefined) return fromCurrentScope(client, usage);

  if (target.startsWith(ORGANIZATION_ID_PREFIX)) {
    if (!isPrefixedId(target, ORGANIZATION_ID_PREFIX)) {
      return {
        status: 'error',
        exitCode: invalidArgument(client, 'Provide a valid organization ID.'),
      };
    }
    return { status: 'ok', value: target };
  }

  if (!slugSchema.safeParse(target).success) {
    return {
      status: 'error',
      exitCode: invalidArgument(
        client,
        'Provide an organization ID or slug. A slug uses 1-48 lowercase letters, numbers, or hyphens.'
      ),
    };
  }
  return fromSlug(client, target);
}

async function fromSlug(
  client: Client,
  slug: string
): Promise<Validated<string>> {
  let organizations: Awaited<ReturnType<typeof listOrganizations>>;
  try {
    organizations = await listOrganizations(client);
  } catch (err) {
    return {
      status: 'error',
      exitCode: handleOrganizationApiError(client, err, {
        action: `find organization ${slug}`,
      }),
    };
  }

  const match = organizations.organizations.find(org => org.slug === slug);
  if (!match) {
    return { status: 'error', exitCode: organizationNotFound(client, slug) };
  }
  return { status: 'ok', value: match.organizationId };
}

async function fromCurrentScope(
  client: Client,
  usage: string
): Promise<Validated<string>> {
  const currentTeam = await resolveScopeTeam(client);
  if (!currentTeam) {
    return {
      status: 'error',
      exitCode: missingArgument(client, {
        reason: AGENT_REASON.MISSING_ARGUMENTS,
        message:
          'Provide an organization ID or slug, or select an organization team with --scope.',
        usage,
        suggestList: true,
      }),
    };
  }

  let team: Awaited<ReturnType<typeof getTeamByIdOrSlug>>;
  try {
    team = await getTeamByIdOrSlug(client, currentTeam, {
      useCurrentTeam: false,
    });
  } catch (err) {
    return {
      status: 'error',
      exitCode: handleOrganizationApiError(client, err, {
        action: `read team ${currentTeam}`,
        notFound: `Couldn't find team ${currentTeam}.`,
      }),
    };
  }

  if (!team.parentId) {
    return {
      status: 'error',
      exitCode: invalidArgument(
        client,
        `Team ${team.slug} does not belong to an organization. Provide an organization ID or slug.`
      ),
    };
  }
  return { status: 'ok', value: team.parentId };
}

/**
 * Resolves the root team for `organizations create`: the active team, which
 * `--scope` selects as it does for every other team-scoped command.
 */
export async function resolveRootTeamId(
  client: Client,
  usage: string
): Promise<Validated<string>> {
  const currentTeam = await resolveScopeTeam(client);
  if (!currentTeam) {
    return {
      status: 'error',
      exitCode: missingArgument(client, {
        reason: AGENT_REASON.MISSING_SCOPE,
        message:
          "Can't create an organization without a team. Select the root team with --scope.",
        usage: `--scope <team> ${usage}`,
      }),
    };
  }
  return { status: 'ok', value: currentTeam };
}

/**
 * The active team. An agent run without `--scope` has no team yet, and then
 * `VERCEL_ORG_ID`, the link, or the only team supplies it. Several teams leave
 * it unchosen, so the caller reports its own missing-team error.
 */
function resolveScopeTeam(client: Client): Promise<string | undefined> {
  return client.resolveCurrentTeam({ ask: false });
}

/** Reports a slug that matches none of the user's organizations. */
function organizationNotFound(client: Client, slug: string): number {
  const message = `Couldn't find organization ${slug}.`;
  const listCommand = getCommandNamePlain('organizations list');
  outputAgentError(client, {
    status: AGENT_STATUS.ERROR,
    reason: AGENT_REASON.NOT_FOUND,
    message,
    next: [{ command: listCommand, when: 'List your organizations' }],
  });
  output.error(message);
  output.log(`\n  List your organizations:\n    ${listCommand}`);
  return 1;
}
