import chalk from 'chalk';
import type Client from '../../util/client';
import type { Project, Team } from '@vercel-internals/types';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  isAPIError,
  LinkRequiredError,
  ProjectNotFound,
} from '../../util/errors-ts';
import { emoji, prependEmoji } from '../../util/emoji';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import {
  outputAgentError,
  outputActionRequired,
  buildCommandWithGlobalFlags,
  shouldEmitNonInteractiveCommandError,
  writeAgentError,
  type AgentErrorPayload,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';
import { prioritySubcommand } from './command';
import {
  validateJsonOutput,
  wantsMachineReadableOutput,
} from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import getTeamByIdOrSlug from '../../util/teams/get-team-by-id-or-slug';
import { canPrompt } from '../../util/can-prompt';
import {
  BUY_PRO_COMMAND,
  PRIORITY_PROJECT_ENABLE_COMMAND,
  buyProFix,
  isProOrEnterprisePlan,
  targetRecovery,
  type ObservabilityPlusFix,
} from '../../util/metrics/plan-gate';
import { quoteArg } from '../../util/flags/quote-arg';

const PRODUCT = 'Priority project';

function teamLabel(team: Team): string {
  return team.name && team.name !== team.slug
    ? `${team.slug} (${team.name})`
    : team.slug;
}

/** Writes one JSON error when `--json` is set. Non-interactive runs exit. */
function emitJsonError(
  client: Client,
  asJson: boolean,
  payload: AgentErrorPayload,
  exitCode: number
): boolean {
  if (!asJson) {
    return false;
  }
  if (shouldEmitNonInteractiveCommandError(client)) {
    outputAgentError(client, payload, exitCode);
  }
  writeAgentError(client, payload);
  return true;
}

function apiErrorReason(err: { status?: number; code?: string }): string {
  if (err.code === 'plan_not_supported') {
    return AGENT_REASON.PLAN_UPGRADE_REQUIRED;
  }
  if (err.status === 403) {
    return 'forbidden';
  }
  if (err.status === 402) {
    return 'payment_required';
  }
  if (err.status === 401) {
    return 'not_authorized';
  }
  if (err.status === 429) {
    return AGENT_REASON.RATE_LIMITED;
  }
  return AGENT_REASON.API_ERROR;
}

function thrownErrorPayload(error: unknown): AgentErrorPayload {
  if (isAPIError(error)) {
    return {
      status: AGENT_STATUS.ERROR,
      reason: apiErrorReason(error),
      message: error.serverMessage || error.message,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ProjectNotFound) {
    return {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.PROJECT_NOT_FOUND,
      message,
    };
  }
  if (error instanceof LinkRequiredError) {
    return {
      status: AGENT_STATUS.ERROR,
      reason: AGENT_REASON.NOT_LINKED,
      message,
    };
  }
  return {
    status: AGENT_STATUS.ERROR,
    reason: AGENT_REASON.API_ERROR,
    message,
  };
}

function failUsage(client: Client, asJson: boolean, message: string): number {
  if (
    emitJsonError(
      client,
      asJson,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message,
      },
      2
    )
  ) {
    return 2;
  }
  output.error(message);
  return 2;
}

async function setPriority(
  client: Client,
  project: Project,
  enabled: boolean,
  asJson: boolean
): Promise<number> {
  try {
    await client.fetch(
      `/v1/security/priority?projectId=${encodeURIComponent(project.id)}`,
      {
        method: 'POST',
        body: { enabled },
        accountId: project.accountId,
      }
    );
  } catch (err: unknown) {
    if (isAPIError(err)) {
      const message =
        err.serverMessage ||
        `${PRODUCT} could not be ${enabled ? 'enabled' : 'disabled'} for ${
          project.name
        }.`;
      const upgradeHint =
        err.code === 'plan_not_supported' && enabled
          ? `Upgrade with ${getCommandName(
              `${BUY_PRO_COMMAND} --scope ${quoteArg(project.accountId)}`
            )}.`
          : undefined;
      if (
        emitJsonError(
          client,
          asJson,
          {
            status: AGENT_STATUS.ERROR,
            reason: apiErrorReason(err),
            message,
            ...(upgradeHint ? { hint: upgradeHint } : {}),
          },
          1
        )
      ) {
        return 1;
      }
      output.error(message);
      if (upgradeHint) {
        output.log(upgradeHint);
      }
      return 1;
    }
    if (emitJsonError(client, asJson, thrownErrorPayload(err), 1)) {
      return 1;
    }
    printError(err, client);
    return 1;
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          enabled,
          projectId: project.id,
          projectName: project.name,
        },
        null,
        2
      )}\n`
    );
    return 0;
  }

  output.log(
    `${PRODUCT} is ${enabled ? 'enabled' : 'disabled'} for ${project.name}.`
  );
  return 0;
}

function refuseEnablePlan(
  client: Client,
  asJson: boolean,
  message: string,
  fix?: ObservabilityPlusFix,
  reason: string = AGENT_REASON.PLAN_UPGRADE_REQUIRED
): number {
  const payload: AgentErrorPayload = {
    status: AGENT_STATUS.ERROR,
    reason,
    message,
    userActionRequired: true,
    hint: fix?.hint,
    ...(fix?.command
      ? {
          next: [
            {
              command: buildCommandWithGlobalFlags(
                client.argv,
                fix.command,
                undefined,
                {
                  excludeFlags: [
                    '--non-interactive',
                    '--project',
                    '--yes',
                    ...(fix.excludeFlags ?? []),
                  ],
                }
              ),
              ...(fix.when ? { when: fix.when } : {}),
            },
          ],
        }
      : { next: undefined }),
  };
  if (shouldEmitNonInteractiveCommandError(client)) {
    outputAgentError(client, payload, 1);
  }
  if (asJson) {
    writeAgentError(client, payload);
    return 1;
  }
  output.error(message);
  if (fix?.hint) {
    output.log(fix.hint);
  }
  return 1;
}

async function enableableTeam(
  client: Client,
  project: Project,
  asJson: boolean
): Promise<Team | number> {
  const accountId = project.accountId;
  if (!accountId?.startsWith('team_')) {
    return refuseEnablePlan(
      client,
      asJson,
      `${PRODUCT} is only available on team accounts. Use --scope to specify one.`,
      undefined,
      AGENT_REASON.MISSING_SCOPE
    );
  }

  let team;
  try {
    team = await getTeamByIdOrSlug(client, accountId, {
      useCurrentTeam: false,
    });
  } catch (error) {
    if (emitJsonError(client, asJson, thrownErrorPayload(error), 1)) {
      return 1;
    }
    printError(error, client);
    return 1;
  }

  if (!isProOrEnterprisePlan(team.billing?.plan)) {
    // `buy pro` acts on the globally selected team, which may not be the
    // project's (a linked directory does not change it), so name the team.
    return refuseEnablePlan(
      client,
      asJson,
      `Priority Projects are only available on Pro or Enterprise team plans.`,
      targetRecovery(
        buyProFix(
          `Upgrade with ${getCommandName(BUY_PRO_COMMAND)}, then run ${getCommandName(PRIORITY_PROJECT_ENABLE_COMMAND)}.`
        ),
        { projectName: project.name, scope: team.slug }
      )
    );
  }
  if (team.billing?.status === 'trialing') {
    return refuseEnablePlan(
      client,
      asJson,
      `${PRODUCT} is not available during the Pro trial period.`
    );
  }
  return team;
}

export default async function priority(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(prioritySubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message,
        },
        2
      );
    }
    if (
      emitJsonError(
        client,
        wantsMachineReadableOutput(undefined, argv),
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message,
        },
        2
      )
    ) {
      return 2;
    }
    printError(error, client);
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    return failUsage(client, false, formatResult.error);
  }
  const asJson = formatResult.jsonOutput;

  const action = parsedArgs.args[0];
  if (action !== 'enable' && action !== 'disable') {
    return failUsage(
      client,
      asJson,
      'Invalid arguments. Usage: `vercel project priority enable|disable [name]`'
    );
  }

  if (parsedArgs.args.length > 2) {
    return failUsage(
      client,
      asJson,
      `Invalid number of arguments. Usage: \`vercel project priority ${action} [name]\``
    );
  }

  const nameArg = parsedArgs.args[1];

  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project priority',
      projectNameOrId: nameArg,
      forReadOnlyCommand: true,
    });
  } catch (error) {
    if (emitJsonError(client, asJson, thrownErrorPayload(error), 1)) {
      return 1;
    }
    printError(error, client);
    return 1;
  }

  // Plan before canPrompt so Hobby is sent to `buy pro` instead of being
  // told to confirm a Priority charge it cannot buy. Use the project's org,
  // not the globally selected team.
  let team: Team | undefined;
  if (action === 'enable') {
    const checked = await enableableTeam(client, project, asJson);
    if (typeof checked === 'number') {
      return checked;
    }
    team = checked;
  } else if (project.accountId?.startsWith('team_')) {
    try {
      team = await getTeamByIdOrSlug(client, project.accountId, {
        useCurrentTeam: false,
      });
    } catch (error) {
      if (emitJsonError(client, asJson, thrownErrorPayload(error), 1)) {
        return 1;
      }
      printError(error, client);
      return 1;
    }
  }

  if (!canPrompt(client)) {
    const globalFlags = getGlobalFlagsFromArgs(client.argv.slice(2)).filter(
      flag => flag !== '--non-interactive'
    );
    const interactiveCommand = getCommandNamePlain(
      `project priority ${action}${nameArg ? ` ${nameArg}` : ''}${
        globalFlags.length ? ` ${globalFlags.join(' ')}` : ''
      }`.trim()
    );
    const target = team ? `${project.name} on team ${team.slug}` : project.name;
    const required = {
      status: AGENT_STATUS.ACTION_REQUIRED,
      reason: AGENT_REASON.CONFIRMATION_REQUIRED,
      action: AGENT_ACTION.CONFIRMATION_REQUIRED,
      message:
        action === 'enable'
          ? `Upgrading ${target} to Priority adds a paid feature and will incur charges on your account. ` +
            'This cannot be confirmed non-interactively: the user must run this command in a terminal and confirm.'
          : `Removing Priority from ${target} turns off additional bot signals for this project. ` +
            'This cannot be confirmed non-interactively: the user must run this command in a terminal and confirm.',
      userActionRequired: true,
      hint:
        action === 'enable'
          ? 'Surface this to the user; enabling a paid feature cannot be automated.'
          : 'Surface this to the user; removing Priority requires interactive confirmation.',
      next: [
        {
          command: interactiveCommand,
          when: 'user runs this command in an interactive terminal',
        },
      ],
    };
    if (shouldEmitNonInteractiveCommandError(client)) {
      outputActionRequired(client, required, 1);
    }
    if (asJson) {
      client.stdout.write(`${JSON.stringify(required, null, 2)}\n`);
      return 1;
    }
    output.error(
      action === 'enable'
        ? 'This command must be run interactively because upgrading to Priority incurs charges.'
        : 'This command must be run interactively to remove Priority.'
    );
    return 1;
  }

  if (action === 'disable') {
    output.print(
      prependEmoji(
        `Removing Priority from ${chalk.bold(project.name)}${
          team ? ` on team ${chalk.bold(teamLabel(team))}` : ''
        } turns off its additional bot signals.\n`,
        emoji('warning')
      )
    );
    const confirmedDisable = await client.input.confirm(
      `Remove Priority from ${project.name}${team ? ` on ${team.slug}` : ''}?`,
      false
    );
    if (!confirmedDisable) {
      output.log('Canceled');
      return 0;
    }
    return setPriority(client, project, false, asJson);
  }

  if (!team) {
    return refuseEnablePlan(
      client,
      asJson,
      `${PRODUCT} is only available on team accounts. Use --scope to specify one.`,
      undefined,
      AGENT_REASON.MISSING_SCOPE
    );
  }

  output.print(
    prependEmoji(
      `Upgrading ${chalk.bold(project.name)} on team ${chalk.bold(
        teamLabel(team)
      )} to Priority will incur charges on your account.\n`,
      emoji('warning')
    )
  );
  const confirmed = await client.input.confirm(
    `Upgrade ${project.name} on ${team.slug} to Priority?`,
    false
  );
  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  return setPriority(client, project, true, asJson);
}
