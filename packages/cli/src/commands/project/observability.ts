import chalk from 'chalk';
import type Client from '../../util/client';
import type { Project } from '@vercel-internals/types';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { emoji, prependEmoji } from '../../util/emoji';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { getGlobalFlagsFromArgs } from '../../util/arg-common';
import {
  outputAgentError,
  outputActionRequired,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';
import { observabilitySubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import getScope from '../../util/get-scope';
import { canPrompt } from '../../util/can-prompt';

async function setObservability(
  client: Client,
  project: Project,
  enabled: boolean,
  asJson: boolean
): Promise<number> {
  try {
    await client.fetch(
      `/v1/observability/manage/configuration/projects/${encodeURIComponent(
        project.id
      )}`,
      {
        method: 'PUT',
        json: true,
        body: { disabled: !enabled },
      }
    );
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.status === 403) {
        output.error(
          err.serverMessage ||
            `You do not have permission to ${
              enabled ? 'enable' : 'disable'
            } Observability Plus for this project.`
        );
        return 1;
      }
      if (err.status === 404 || err.status === 402) {
        output.error(
          err.serverMessage ||
            `Observability Plus could not be ${
              enabled ? 'enabled' : 'disabled'
            } for ${project.name}. It may not be available on your current plan.`
        );
        if (err.link) {
          output.log(`Learn more: ${err.link}`);
        }
        return 1;
      }
    }
    printError(err);
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
    `Observability Plus is ${enabled ? 'enabled' : 'disabled'} for ${
      project.name
    }.`
  );
  return 0;
}

export default async function observability(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    observabilitySubcommand.options
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

  const action = parsedArgs.args[0];
  if (action !== 'enable' && action !== 'disable') {
    output.error(
      'Invalid arguments. Usage: `vercel project observability enable|disable [name]`'
    );
    return 2;
  }

  if (parsedArgs.args.length > 2) {
    output.error(
      `Invalid number of arguments. Usage: \`vercel project observability ${action} [name]\``
    );
    return 2;
  }

  const formatResult = validateJsonOutput(parsedArgs.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  const nameArg = parsedArgs.args[1];
  if (!canPrompt(client)) {
    const globalFlags = getGlobalFlagsFromArgs(client.argv.slice(2)).filter(
      flag => flag !== '--non-interactive'
    );
    const interactiveCommand = getCommandNamePlain(
      `project observability ${action}${nameArg ? ` ${nameArg}` : ''}${
        globalFlags.length ? ` ${globalFlags.join(' ')}` : ''
      }`.trim()
    );
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message:
          action === 'enable'
            ? 'Enabling Observability Plus adds a paid feature to this project and will incur charges on your account. ' +
              'This cannot be confirmed non-interactively: the user must run this command in a terminal and confirm.'
            : 'Disabling Observability Plus turns off enhanced observability for this project. ' +
              'This cannot be confirmed non-interactively: the user must run this command in a terminal and confirm.',
        userActionRequired: true,
        hint:
          action === 'enable'
            ? 'Surface this to the user; enabling a paid feature cannot be automated.'
            : 'Surface this to the user; disabling Observability Plus requires interactive confirmation.',
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
        ? 'This command must be run interactively because enabling Observability Plus incurs charges.'
        : 'This command must be run interactively to disable Observability Plus.'
    );
    return 1;
  }

  let project: Project;
  try {
    project = await getProjectByCwdOrLink({
      client,
      commandName: 'project observability',
      projectNameOrId: nameArg,
      forReadOnlyCommand: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  if (action === 'disable') {
    output.print(
      prependEmoji(
        `Disabling Observability Plus for ${chalk.bold(
          project.name
        )} will turn off enhanced observability for this project.\n`,
        emoji('warning')
      )
    );
    const confirmedDisable = await client.input.confirm(
      `Disable Observability Plus for ${project.name}?`,
      false
    );
    if (!confirmedDisable) {
      output.log('Canceled');
      return 0;
    }
    return setObservability(client, project, false, asJson);
  }

  const { team } = await getScope(client);
  if (!team) {
    output.error(
      'Observability Plus requires a team. Use --scope to specify one.'
    );
    return 1;
  }
  if (team.billing?.plan === 'hobby') {
    output.error(
      'Observability Plus requires an active Pro or Enterprise plan.'
    );
    output.log(`Upgrade with ${getCommandName('buy pro')}.`);
    return 1;
  }

  output.print(
    prependEmoji(
      `Enabling Observability Plus for ${chalk.bold(
        project.name
      )} will incur charges on your account.\n`,
      emoji('warning')
    )
  );
  const confirmed = await client.input.confirm(
    `Enable Observability Plus for ${project.name}?`,
    false
  );
  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  return setObservability(client, project, true, asJson);
}
