import chalk from 'chalk';
import type Client from '../../util/client';
import type { Project } from '@vercel-internals/types';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { emoji, prependEmoji } from '../../util/emoji';
import {
  exitWithNonInteractiveError,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { webAnalyticsDisableSubcommand } from './command';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import getProjectByCwdOrLink from '../../util/projects/get-project-by-cwd-or-link';
import {
  isHobbyProject,
  projectLabel,
  refuseExplicitAccountConflict,
  resolveProjectFeatureConsent,
  warnIfOutsideCurrentTeam,
} from '../../util/projects/project-feature-consent';

interface ToggleResponse {
  value: boolean;
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
        accountId: project.accountId,
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
    `Web Analytics is ${result.value ? 'enabled' : 'disabled'} for ${await projectLabel(client, project)}.`
  );
  return 0;
}

export default async function webAnalytics(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  // `disable` takes every option `enable` does, plus `--yes`.
  const flagsSpecification = getFlagsSpecification(
    webAnalyticsDisableSubcommand.options
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
    return 2;
  }
  const asJson = formatResult.jsonOutput;

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

  // Enabling is usage on the account's current plan, like deploying, so it is
  // an ordinary write: no confirmation, `--yes`, or `--scope`. Plan limits
  // are enforced by the API.
  if (action === 'enable') {
    const conflict = await refuseExplicitAccountConflict(client, {
      project,
      consequence: `Can't enable Web Analytics for ${project.name}.`,
    });
    if (conflict) {
      return conflict.exitCode;
    }
    if (!asJson) {
      await warnIfOutsideCurrentTeam(client, project);
    }
    return setWebAnalytics(client, project, true, asJson);
  }

  const isHobby = await isHobbyProject(client, project);
  const consequence = `Disabling Web Analytics for ${project.name} will stop data collection for this project.`;

  const consent = await resolveProjectFeatureConsent(client, {
    command: 'project web-analytics',
    action,
    projectArg: projectNameOrId,
    project,
    billable: !isHobby,
    yes: Boolean(parsedArgs.flags['--yes']),
    consequence,
  });
  if (consent.kind === 'refused') {
    return consent.exitCode;
  }

  if (consent.kind === 'prompt' || !asJson) {
    output.print(
      prependEmoji(
        `Disabling Web Analytics for ${chalk.bold(
          project.name
        )} will stop data collection for this project.\n`,
        emoji('warning')
      )
    );
  }

  if (consent.kind === 'prompt') {
    const target = `${project.name}${
      consent.team ? ` on team ${consent.team}` : ''
    }`;
    const confirmed = await client.input.confirm(
      `Disable Web Analytics for ${target}?`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  return setWebAnalytics(client, project, false, asJson);
}
