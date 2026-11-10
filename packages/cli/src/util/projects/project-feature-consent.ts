import type { Project } from '@vercel-internals/types';
import type Client from '../client';
import output from '../../output-manager';
import { canPrompt } from '../can-prompt';
import {
  buildCommandWithGlobalFlags,
  outputActionRequired,
  outputAgentError,
} from '../agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../agent-output-constants';
import { getPlatformEnv } from '@vercel/build-utils';
import { quoteArg } from '../flags/quote-arg';
import { scopeFlagPassed } from '../get-scope';
import getUser from '../get-user';
import getTeamByIdOrSlug from '../teams/get-team-by-id-or-slug';

const TEAM_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function projectTeamId(project: Project): string | undefined {
  return project.accountId?.startsWith('team_') ? project.accountId : undefined;
}

/**
 * Whether the account that owns the project is on the Hobby plan. Reads the
 * project's own team (or the user, for a personal project), never the current
 * scope: a linked project can belong to a different team. Any failure counts
 * as not Hobby, so a paid change is never treated as free.
 */
export async function isHobbyProject(
  client: Client,
  project: Project
): Promise<boolean> {
  try {
    const teamId = projectTeamId(project);
    const plan = teamId
      ? (await getTeamByIdOrSlug(client, teamId, { useCurrentTeam: false }))
          .billing?.plan
      : (await getUser(client)).billing?.plan;
    return plan === 'hobby';
  } catch (err: unknown) {
    output.debug(
      `Failed to resolve the project's billing plan: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}

/**
 * Whether `--scope` or `VERCEL_ORG_ID` explicitly names an account other than
 * the one that owns the project. The project can come from a link file a
 * contributor controls, so a mismatch is never resolved by acting on the
 * project's owner, in any mode.
 */
function explicitAccountConflict(client: Client, project: Project): boolean {
  const orgId = getPlatformEnv('ORG_ID');
  if (orgId && orgId !== project.accountId) return true;
  return (
    scopeFlagPassed(client.argv) &&
    client.config.currentTeam !== projectTeamId(project)
  );
}

/**
 * Whether the person running the command named the project's team, given no
 * conflict: `--scope` (which then resolved to it) or `VERCEL_ORG_ID` set to
 * it. `vercel.json` `scope` and the link don't count.
 */
function teamNamed(client: Client, teamId: string): boolean {
  return scopeFlagPassed(client.argv) || getPlatformEnv('ORG_ID') === teamId;
}

export interface ProjectFeatureConsentOptions {
  /** The subcommand path, such as `project speed-insights`. */
  command: string;
  action: 'enable' | 'disable';
  /** The project argument exactly as typed, if any. */
  projectArg?: string;
  project: Project;
  /** Whether the change starts or stops a charge on the project's account. */
  billable: boolean;
  /** Whether `--yes` was passed. */
  yes: boolean;
  /** Plain-text effect of the change, shown in the error and JSON payload. */
  consequence: string;
}

/**
 * - `granted`: `--yes` and every input its tier needs are present; skip the prompt.
 * - `prompt`: interactive; ask the user to confirm. `team` is the slug of the
 *   team that owns the project, which the prompt must name.
 * - `refused`: nothing was changed; return `exitCode`.
 */
export type ProjectFeatureConsent =
  | { kind: 'granted' }
  | { kind: 'prompt'; team?: string }
  | { kind: 'refused'; exitCode: number };

async function scopeValue(client: Client, teamId: string): Promise<string> {
  try {
    const team = await getTeamByIdOrSlug(client, teamId, {
      useCurrentTeam: false,
    });
    if (team.slug && TEAM_SLUG_PATTERN.test(team.slug)) {
      return team.slug;
    }
  } catch (err: unknown) {
    output.debug(
      `Failed to resolve team ${teamId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
  return teamId;
}

/**
 * The project name, followed by `on team <slug>` when a team owns it, for
 * receipts and errors. A linked project can belong to a team other than the
 * current one, and toggles act on the project's team, so output names it.
 */
export async function projectLabel(
  client: Client,
  project: Project
): Promise<string> {
  const teamId = projectTeamId(project);
  return teamId
    ? `${project.name} on team ${await scopeValue(client, teamId)}`
    : project.name;
}

/**
 * Warns before a toggle when the project belongs to an account other than the
 * current team, as when the folder is linked to another team or
 * `VERCEL_ORG_ID` names one. Like `vercel deploy`, it stays quiet when no team
 * is selected.
 */
export async function warnIfOutsideCurrentTeam(
  client: Client,
  project: Project
): Promise<void> {
  const currentTeam = client.config.currentTeam;
  if (!currentTeam || currentTeam === project.accountId) {
    return;
  }
  const teamId = projectTeamId(project);
  const owner = teamId
    ? `team ${await scopeValue(client, teamId)}`
    : 'your personal account';
  output.warn(
    `${project.name} belongs to ${owner}, not your current team. Using ${owner}.`
  );
}

/**
 * Refuses when `--scope` or `VERCEL_ORG_ID` explicitly names an account other
 * than the project's owner. This is target resolution, not consent: it applies
 * to every toggle, including ordinary ones that need no confirmation.
 * `consequence` is the sentence that starts the error message.
 */
export async function refuseExplicitAccountConflict(
  client: Client,
  opts: { project: Project; consequence: string }
): Promise<{ kind: 'refused'; exitCode: number } | undefined> {
  if (!explicitAccountConflict(client, opts.project)) {
    return undefined;
  }
  const teamId = projectTeamId(opts.project);
  const ownerScope = teamId ? await scopeValue(client, teamId) : undefined;
  const owner = ownerScope ? `team ${ownerScope}` : 'a personal account';
  const message = `${opts.consequence} --scope or VERCEL_ORG_ID names a different account than the project's owner, ${owner}. Nothing was changed.`;
  outputAgentError(
    client,
    {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.CONFLICT,
      message,
      userActionRequired: true,
      hint: ownerScope
        ? `Check that the project link is correct. To act on ${owner}, pass --scope ${ownerScope} or set VERCEL_ORG_ID to that team's ID, once the user approves.`
        : 'Check that the project link is correct, then run the command without --scope or VERCEL_ORG_ID.',
    },
    1
  );
  output.error(message);
  return { kind: 'refused', exitCode: 1 };
}

/**
 * Decides whether a project feature toggle may run, following the consent
 * rules for billing changes: `--yes` is required without a terminal, and a
 * billable change on a team project also needs the team named with `--scope`
 * or `VERCEL_ORG_ID`. With `--yes` in a terminal, the prompt is skipped only
 * when those inputs are also present. An explicit `--scope` or
 * `VERCEL_ORG_ID` that doesn't match the project's owner is refused in every
 * mode, before any prompt.
 */
export async function resolveProjectFeatureConsent(
  client: Client,
  opts: ProjectFeatureConsentOptions
): Promise<ProjectFeatureConsent> {
  const teamId = projectTeamId(opts.project);

  const conflict = await refuseExplicitAccountConflict(client, opts);
  if (conflict) {
    return conflict;
  }

  const needsTeam =
    opts.billable && teamId !== undefined && !teamNamed(client, teamId);

  if (opts.yes && !needsTeam) {
    return { kind: 'granted' };
  }
  if (canPrompt(client)) {
    return {
      kind: 'prompt',
      team: teamId ? await scopeValue(client, teamId) : undefined,
    };
  }

  const scope =
    needsTeam && teamId ? await scopeValue(client, teamId) : undefined;
  const missing = [
    ...(opts.yes ? [] : ['--yes']),
    ...(scope ? ['--scope'] : []),
  ];
  const nextCommand = buildCommandWithGlobalFlags(
    client.argv,
    `${opts.command} ${opts.action}${
      opts.projectArg ? ` ${quoteArg(opts.projectArg)}` : ''
    } --yes${scope ? ` --scope ${scope}` : ''}`
  );

  const confirmWith = missing.join(' and ');
  const message = `${opts.consequence} Confirm with ${confirmWith} to continue. Nothing was changed.`;
  const reason = opts.yes
    ? AGENT_REASON.MISSING_SCOPE
    : AGENT_REASON.CONFIRMATION_REQUIRED;
  outputActionRequired(
    client,
    {
      status: AGENT_STATUS.ACTION_REQUIRED,
      reason,
      action: AGENT_ACTION.CONFIRMATION_REQUIRED,
      message,
      userActionRequired: true,
      missing,
      hint: 'Ask the user to approve this change before running the next command. Do not add --yes without their approval.',
      next: [
        {
          command: nextCommand,
          when: `Only after the user approves the change${
            scope ? ` to team ${scope}` : ''
          }`,
        },
      ],
    },
    1
  );
  output.error(`${message}\n\nOnce approved, run:\n  ${nextCommand}`);
  return { kind: 'refused', exitCode: 1 };
}
