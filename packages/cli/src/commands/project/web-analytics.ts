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
  outputActionRequired,
  outputAgentError,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';
import { webAnalyticsSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import getScope from '../../util/get-scope';

interface ToggleResponse {
  value: boolean;
}

const LIMITS_DOCS_URL = 'https://vercel.com/docs/analytics/limits-and-pricing';

async function isHobbyPlan(client: Client): Promise<boolean> {
  try {
    const { team, user } = await getScope(client);
    const plan = team?.billing?.plan ?? user?.billing?.plan;
    return plan === 'hobby';
  } catch (err: unknown) {
    output.debug(
      `Failed to resolve billing plan: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}

async function setWebAnalytics(
  client: Client,
  project: Project,
  enabled: boolean,
  asJson: boolean
): Promise<number> {
  let result: ToggleResponse;
  try {
    const query = new URLSearchParams({ projectId: project.id });
    result = await client.fetch<ToggleResponse>(
      `/web/insights/toggle?${query.toString()}`,
      {
        method: 'POST',
        json: true,
        body: { value: enabled },
      }
    );
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, {
      variant: 'web-analytics',
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
    result.value
      ? `Web Analytics is enabled for ${project.name}.`
      : `Web Analytics is disabled for ${project.name}.`
  );
  return 0;
}

export default async function webAnalytics(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    webAnalyticsSubcommand.options
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
      `Invalid number of arguments. Usage: \`vercel project web-analytics ${
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

  const isHobby = action === 'enable' ? await isHobbyPlan(client) : false;

  if (!canPrompt(client)) {
    const globalFlags = getGlobalFlagsFromArgs(client.argv.slice(2)).filter(
      flag => flag !== '--non-interactive'
    );
    const interactiveCommand = getCommandNamePlain(
      `project web-analytics ${action}${
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
          action === 'disable'
            ? 'Disabling Web Analytics stops data collection for this project. ' +
              'This cannot be confirmed non-interactively: the user must run this command in a terminal and confirm.'
            : isHobby
              ? `Web Analytics is free with limits documented on ${LIMITS_DOCS_URL}. ` +
                'This cannot be confirmed non-interactively: the user must run this command in a terminal and confirm.'
              : 'Enabling Web Analytics adds a paid feature to this project and will incur charges on your account. ' +
                'This cannot be confirmed non-interactively: the user must run this command in a terminal and confirm.',
        userActionRequired: true,
        hint:
          action === 'disable'
            ? 'Surface this to the user; disabling Web Analytics requires interactive confirmation.'
            : isHobby
              ? 'Surface this to the user; enabling Web Analytics requires interactive confirmation.'
              : 'Surface this to the user; enabling a paid feature cannot be automated.',
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
      action === 'disable'
        ? 'This command must be run interactively to disable Web Analytics.'
        : isHobby
          ? 'This command must be run interactively to enable Web Analytics.'
          : 'This command must be run interactively because enabling Web Analytics incurs charges.'
    );
    return 1;
  }

  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project web-analytics',
      projectNameOrId,
      forReadOnlyCommand: true,
    });
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, {
      variant: 'web-analytics',
    });
    printError(err);
    return 1;
  }

  if (action === 'disable') {
    output.print(
      prependEmoji(
        `Disabling Web Analytics for ${chalk.bold(
          project.name
        )} will stop data collection for this project.\n`,
        emoji('warning')
      )
    );
    const confirmedDisable = await client.input.confirm(
      `Disable Web Analytics for ${project.name}?`,
      false
    );
    if (!confirmedDisable) {
      output.log('Canceled');
      return 0;
    }
    return setWebAnalytics(client, project, false, asJson);
  }

  if (isHobby) {
    output.print(
      `Web Analytics is free for ${chalk.bold(
        project.name
      )} with limits documented on ${LIMITS_DOCS_URL}.\n`
    );
  } else {
    output.print(
      prependEmoji(
        `Enabling Web Analytics for ${chalk.bold(
          project.name
        )} will incur charges on your account.\n`,
        emoji('warning')
      )
    );
  }
  const confirmed = await client.input.confirm(
    `Enable Web Analytics for ${project.name}?`,
    false
  );
  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  return setWebAnalytics(client, project, true, asJson);
}
