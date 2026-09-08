import chalk from 'chalk';
import type Client from '../../util/client';
import type { Project } from '@vercel-internals/types';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { canPrompt } from '../../util/can-prompt';
import { emoji, prependEmoji } from '../../util/emoji';
import { getCommandNamePlain } from '../../util/pkg-name';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import {
  exitWithNonInteractiveError,
  outputAgentError,
  outputActionRequired,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';
import { speedInsightsSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import getScope from '../../util/get-scope';

interface ToggleResponse {
  value: boolean;
}

async function setSpeedInsights(
  client: Client,
  project: Project,
  enabled: boolean,
  asJson: boolean
): Promise<number> {
  let result: ToggleResponse;
  try {
    const query = new URLSearchParams({ projectId: project.id });
    result = await client.fetch<ToggleResponse>(
      `/speed-insights/toggle?${query.toString()}`,
      {
        method: 'POST',
        json: true,
        body: { value: enabled },
      }
    );
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, {
      variant: 'speed-insights',
    });
    printError(err);
    return 1;
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          enabled: result.value,
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
    `Speed Insights is ${result.value ? 'enabled' : 'disabled'} for ${project.name}.`
  );
  return 0;
}

export default async function speedInsights(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    speedInsightsSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: error instanceof Error ? error.message : String(error),
        },
        1
      );
    }
    printError(error);
    return 1;
  }

  const firstArg = parsedArgs.args[0];
  const hasActionWord = firstArg === 'enable' || firstArg === 'disable';
  const action = firstArg === 'disable' ? 'disable' : 'enable';
  const projectNameOrId = hasActionWord ? parsedArgs.args[1] : firstArg;
  const extraArgs = hasActionWord
    ? parsedArgs.args.slice(2)
    : parsedArgs.args.slice(1);

  if (extraArgs.length > 0) {
    output.error(
      `Invalid number of arguments. Usage: \`vercel project speed-insights ${
        hasActionWord ? `${action} ` : ''
      }[name]\``
    );
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  if (!canPrompt(client)) {
    const globalFlags = getGlobalFlagsFromArgs(client.argv.slice(2)).filter(
      flag => flag !== '--non-interactive'
    );
    const interactiveCommand = getCommandNamePlain(
      `project speed-insights ${action}${
        projectNameOrId ? ` ${projectNameOrId}` : ''
      }${globalFlags.length ? ` ${globalFlags.join(' ')}` : ''}`.trim()
    );
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message:
          action === 'enable'
            ? 'Enabling Speed Insights adds a paid feature to this project and will incur charges on your account. ' +
              'This cannot be confirmed non-interactively: the user must run this command in a terminal and confirm.'
            : 'Disabling Speed Insights stops performance data collection for this project. ' +
              'This cannot be confirmed non-interactively: the user must run this command in a terminal and confirm.',
        userActionRequired: true,
        hint:
          action === 'enable'
            ? 'Surface this to the user; enabling a paid feature cannot be automated.'
            : 'Surface this to the user; disabling Speed Insights requires interactive confirmation.',
        next: [
          {
            command: interactiveCommand,
            when: 'user runs this command in an interactive terminal',
          },
        ],
      },
      1
    );
    output.error(
      action === 'enable'
        ? 'This command must be run interactively because enabling Speed Insights incurs charges.'
        : 'This command must be run interactively to disable Speed Insights.'
    );
    return 1;
  }

  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project speed-insights',
      projectNameOrId,
      forReadOnlyCommand: true,
    });
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, {
      variant: 'speed-insights',
    });
    printError(err);
    return 1;
  }

  if (action === 'disable') {
    output.print(
      prependEmoji(
        `Disabling Speed Insights for ${chalk.bold(
          project.name
        )} will stop performance data collection for this project.\n`,
        emoji('warning')
      )
    );
    const confirmedDisable = await client.input.confirm(
      `Disable Speed Insights for ${project.name}?`,
      false
    );
    if (!confirmedDisable) {
      output.log('Canceled');
      return 0;
    }
    return setSpeedInsights(client, project, false, asJson);
  }

  let isHobby = false;
  try {
    const { team, user } = await getScope(client);
    isHobby = (team?.billing?.plan ?? user?.billing?.plan) === 'hobby';
  } catch {
    isHobby = false;
  }

  output.print(
    prependEmoji(
      isHobby
        ? `On the Hobby plan, Speed Insights is only available for one project.\n`
        : `Enabling Speed Insights for ${chalk.bold(
            project.name
          )} will incur charges on your account.\n`,
      emoji('warning')
    )
  );
  const confirmed = await client.input.confirm(
    `Enable Speed Insights for ${project.name}?`,
    false
  );
  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  return setSpeedInsights(client, project, true, asJson);
}
