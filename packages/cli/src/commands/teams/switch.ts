import chalk from 'chalk';
import { emoji } from '../../util/emoji';
import getUser from '../../util/get-user';
import getTeams from '../../util/teams/get-teams';
import listInput from '../../util/input/list';
import type { Team, GlobalConfig } from '@vercel-internals/types';
import { writeToConfigFile } from '../../util/config/files';
import output from '../../output-manager';
import { TeamsSwitchTelemetryClient } from '../../util/telemetry/commands/teams/switch';
import type Client from '../../util/client';
import { switchSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandNamePlain } from '../../util/pkg-name';
import {
  outputActionRequired,
  outputAgentError,
} from '../../util/agent-output';
import {
  getGlobalFlagsOnlyFromArgs,
  getSameSubcommandSuggestionFlags,
} from '../../util/arg-common';
import { getLinkFromDir, getVercelDirectory } from '../../util/projects/link';

/** Append global argv flags (--cwd, --non-interactive, etc.) so agents can re-run with same context. */
function withGlobalFlags(client: Client, commandTemplate: string): string {
  const flags = getGlobalFlagsOnlyFromArgs(client.argv.slice(2));
  return getCommandNamePlain(`${commandTemplate} ${flags.join(' ')}`.trim());
}

const updateCurrentTeam = (config: GlobalConfig, team?: Team) => {
  if (team) {
    config.currentTeam = team.id;
  } else {
    delete config.currentTeam;
  }

  writeToConfigFile(config);
};

async function warnIfStaleLinkExists(
  client: Client,
  newOrgId: string
): Promise<void> {
  let link: { orgId: string } | null = null;
  try {
    link = await getLinkFromDir<{ orgId: string }>(
      getVercelDirectory(client.cwd)
    );
  } catch (_error) {
    link = null;
  }

  if (!link || link.orgId === newOrgId) {
    return;
  }

  output.warn(
    `This directory is linked to a project under a different team/scope. ` +
      `Commands like \`deploy\` will still use the linked project's team. ` +
      `Run \`vc link\` to re-link.`
  );
}

export default async function change(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(switchSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }
  let {
    args: [desiredSlug],
  } = parsedArgs;

  // Non-interactive requires a slug (or username) as first positional. Handle
  // this before fetching teams so a stale currentTeam does not surface as
  // current_team_invalid when the real issue is a missing required argument.
  if (client.nonInteractive && !desiredSlug) {
    const fullArgs = client.argv.slice(2);
    const switchIdx = fullArgs.findIndex(a => a === 'switch' || a === 'change');
    const afterSwitch =
      switchIdx >= 0 ? fullArgs.slice(switchIdx + 1) : fullArgs;
    const afterPositional =
      afterSwitch.length > 0 && !afterSwitch[0].startsWith('-')
        ? afterSwitch.slice(1)
        : afterSwitch;
    const flagTail = getSameSubcommandSuggestionFlags(afterPositional);
    const cmd = getCommandNamePlain(
      `teams switch <slug> ${flagTail.join(' ')}`.trim()
    );
    outputActionRequired(
      client,
      {
        status: 'action_required',
        reason: 'missing_arguments',
        action: 'missing_arguments',
        message: `In non-interactive mode a team slug (or username for personal scope) is required. Run: ${cmd}`,
        next: [
          {
            command: cmd,
            when: 'to switch scope (replace <slug> with team slug)',
          },
          {
            command: withGlobalFlags(client, 'teams list'),
            when: 'to list teams and slugs',
          },
        ],
      },
      1
    );
    return 1;
  }

  const { config, telemetryEventStore } = client;
  const telemetry = new TeamsSwitchTelemetryClient({
    opts: {
      store: telemetryEventStore,
    },
  });
  telemetry.trackCliArgumentName(desiredSlug);

  output.spinner('Fetching teams information');
  const [user, teams] = await Promise.all([getUser(client), getTeams(client)]);

  const defaultTeamId =
    user.version === 'northstar' ? user.defaultTeamId : undefined;
  const currentTeamId = config.currentTeam || defaultTeamId;
  const personalScopeSelected = !currentTeamId;

  const currentTeam = currentTeamId
    ? teams.find(team => team.id === currentTeamId)
    : undefined;

  if (!personalScopeSelected && !currentTeam) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'current_team_invalid',
          message:
            'You are not a member of the current team anymore. Switch to a valid team or personal scope.',
          next: [
            {
              command: withGlobalFlags(client, 'teams list'),
              when: 'to list teams and slugs you can switch to',
            },
            {
              command: withGlobalFlags(client, 'login'),
              when: 'to re-authenticate if your session or team membership changed',
            },
          ],
        },
        1
      );
    }
    output.error(`You are not a member of the current team anymore.`);
    return 1;
  }

  if (!desiredSlug) {
    const teamChoices = teams
      .slice(0)
      .sort((a, b) => {
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      })
      .map(team => {
        let title = `${team.name} (${team.slug})`;
        const selected = team.id === currentTeam?.id;

        if (selected) {
          title += ` ${chalk.bold('(current)')}`;
        }

        if (team.limited) {
          title += ` ${emoji('locked')}`;
        }

        return {
          name: title,
          value: team.slug,
          short: team.slug,
          selected,
        };
      });

    // Add the User scope entry at the top
    let suffix = personalScopeSelected ? ` ${chalk.bold('(current)')}` : '';

    // SAML tokens can not interact with the user scope
    if (user.limited) {
      suffix += ` ${emoji('locked')}`;
    }

    const personalAccountChoice =
      user.version === 'northstar'
        ? []
        : [
            { separator: 'Personal Account' },
            {
              name: `${user.name || user.email} (${user.username})${suffix}`,
              value: user.username,
              short: user.username,
              selected: personalScopeSelected,
            },
          ];

    const choices = [
      ...personalAccountChoice,
      { separator: 'Teams' },
      ...teamChoices,
    ];

    output.stopSpinner();

    if (client.nonInteractive) {
      const fullArgs = client.argv.slice(2);
      const switchIdx = fullArgs.findIndex(
        a => a === 'switch' || a === 'change'
      );
      const afterSwitch =
        switchIdx >= 0 ? fullArgs.slice(switchIdx + 1) : fullArgs;
      // Drop positional slug if present; only global flags in suggestion
      const afterPositional =
        afterSwitch.length > 0 && !afterSwitch[0].startsWith('-')
          ? afterSwitch.slice(1)
          : afterSwitch;
      const flagTail = getSameSubcommandSuggestionFlags(afterPositional);
      const cmd = getCommandNamePlain(
        `teams switch <slug> ${flagTail.join(' ')}`.trim()
      );
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_arguments',
          action: 'missing_arguments',
          message: `In non-interactive mode a team slug (or username for personal scope) is required. Run: ${cmd}`,
          next: [
            {
              command: cmd,
              when: 'to switch scope (replace <slug> with team slug)',
            },
            {
              command: withGlobalFlags(client, 'teams list'),
              when: 'to list teams and slugs',
            },
          ],
        },
        1
      );
      return 1;
    }

    desiredSlug = await listInput(client, {
      message: 'Switch to:',
      choices,
      eraseFinalAnswer: true,
    });
  }

  // Abort
  if (!desiredSlug) {
    output.log('No changes made.');
    return 0;
  }

  if (desiredSlug === user.username || desiredSlug === user.email) {
    if (user.version === 'northstar') {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'personal_scope_not_allowed',
            message:
              'You cannot set your Personal Account as the scope in this account type.',
          },
          1
        );
      }
      output.error('You cannot set your Personal Account as the scope.');
      return 1;
    }

    // Switch to user's personal account
    if (personalScopeSelected) {
      output.log('No changes made');
      return 0;
    }

    if (user.limited) {
      await client.reauthenticate({
        scope: user.username,
        teamId: null,
      });
    }

    updateCurrentTeam(config);

    output.success(
      `Your account (${chalk.bold(user.username)}) is now active!`
    );
    await warnIfStaleLinkExists(client, user.id);
    return 0;
  }

  // Switch to selected team
  const newTeam = teams.find(team => team.slug === desiredSlug);

  if (!newTeam) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'scope_not_accessible',
          message: `You do not have permission to access scope "${desiredSlug}".`,
          next: [
            {
              command: withGlobalFlags(client, 'teams list'),
            },
          ],
        },
        1
      );
    }
    output.error(
      `You do not have permission to access scope ${chalk.bold(desiredSlug)}.`
    );
    return 1;
  }

  if (newTeam.slug === currentTeam?.slug) {
    output.log('No changes made');
    return 0;
  }

  if (newTeam.limited) {
    const samlEnabled = newTeam.saml?.connection?.state === 'active';
    await client.reauthenticate({
      teamId: newTeam.id,
      scope: newTeam.slug,
      enforced: samlEnabled && newTeam.saml?.enforced === true,
    });
  }

  updateCurrentTeam(config, newTeam);

  output.success(
    `The team ${chalk.bold(newTeam.name)} (${newTeam.slug}) is now active!`
  );
  await warnIfStaleLinkExists(client, newTeam.id);
  return 0;
}
