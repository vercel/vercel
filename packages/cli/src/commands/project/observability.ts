import chalk from 'chalk';
import type Client from '../../util/client';
import type { Project } from '@vercel-internals/types';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { emoji, prependEmoji } from '../../util/emoji';
import { outputAgentError } from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { observabilityDisableSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import {
  projectLabel,
  refuseExplicitAccountConflict,
  resolveProjectFeatureConsent,
  warnIfOutsideCurrentTeam,
} from '../../util/projects/project-feature-consent';

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
        accountId: project.accountId,
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
        // The API decides plan availability. Agents get the refusal as
        // `plan_limit`, with the API's own explanation kept out of `message`.
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.PLAN_LIMIT,
            message: `Couldn't ${
              enabled ? 'enable' : 'disable'
            } Observability Plus for ${await projectLabel(client, project)}. It may not be available on the current plan.`,
            userActionRequired: true,
            hint: "Observability Plus needs a Pro or Enterprise team with the Observability Plus add-on. Ask a team owner to check the team's plan, then retry.",
            ...(err.serverMessage && {
              data: { apiMessage: err.serverMessage },
            }),
          },
          1
        );
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
    `Observability Plus is ${enabled ? 'enabled' : 'disabled'} for ${await projectLabel(client, project)}.`
  );
  return 0;
}

export default async function observability(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  // `disable` takes every option `enable` does, plus `--yes`.
  const flagsSpecification = getFlagsSpecification(
    observabilityDisableSubcommand.options
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
        2
      );
    }
    printError(error);
    return 2;
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
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  const nameArg = parsedArgs.args[1];

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

  // Enabling is usage on the account's current plan, like deploying, so it is
  // an ordinary write: no confirmation, `--yes`, or `--scope`. Plan
  // availability (Pro or Enterprise) is enforced by the API.
  if (action === 'enable') {
    const conflict = await refuseExplicitAccountConflict(client, {
      project,
      consequence: `Can't enable Observability Plus for ${project.name}.`,
    });
    if (conflict) {
      return conflict.exitCode;
    }
    if (!asJson) {
      await warnIfOutsideCurrentTeam(client, project);
    }
    return setObservability(client, project, true, asJson);
  }

  const consent = await resolveProjectFeatureConsent(client, {
    command: 'project observability',
    action,
    projectArg: nameArg,
    project,
    billable: true,
    yes: Boolean(parsedArgs.flags['--yes']),
    consequence: `Disabling Observability Plus for ${project.name} will turn off enhanced observability for this project.`,
  });
  if (consent.kind === 'refused') {
    return consent.exitCode;
  }

  if (consent.kind === 'prompt' || !asJson) {
    output.print(
      prependEmoji(
        `Disabling Observability Plus for ${chalk.bold(
          project.name
        )} will turn off enhanced observability for this project.\n`,
        emoji('warning')
      )
    );
  }

  if (consent.kind === 'prompt') {
    const target = `${project.name}${
      consent.team ? ` on team ${consent.team}` : ''
    }`;
    const confirmed = await client.input.confirm(
      `Disable Observability Plus for ${target}?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  return setObservability(client, project, false, asJson);
}
