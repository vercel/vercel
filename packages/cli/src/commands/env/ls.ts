import chalk from 'chalk';
import ms from 'ms';
import type {
  CustomEnvironment,
  ProjectEnvVariable,
  ProjectLinked,
} from '@vercel-internals/types';
import type Client from '../../util/client';
import formatTable from '../../util/format-table';
import getEnvRecords from '../../util/env/get-env-records';
import {
  getEnvTargetPlaceholder,
  resolveEnvTargetInput,
} from '../../util/env/env-target';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import ellipsis from '../../util/output/ellipsis';
import { getCustomEnvironments } from '../../util/target/get-custom-environments';
import formatEnvironments from '../../util/env/format-environments';
import { formatProject } from '../../util/projects/format-project';
import output from '../../output-manager';
import { validateJsonOutput } from '../../util/output-format';
import { EnvLsTelemetryClient } from '../../util/telemetry/commands/env/ls';
import { listSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { resolveProjectContextWithEnvRequests } from './linked-env-requests';
import { determineAgent } from '@vercel/detect-agent';
import { suggestNextCommands } from '../../util/suggest-next-commands';
import { isGuidanceEnabled } from '../../util/guidance/is-enabled';
import { validateLsArgs } from '../../util/validate-ls-args';
import { outputAgentError, withGlobalFlags } from '../../util/agent-output';
import { isSecretEnvVar } from '../../util/env/env-var-config-secret-ui';

export default async function ls(client: Client, argv: string[]) {
  const telemetryClient = new EnvLsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 2;
  }
  const { args, flags } = parsedArgs;

  const validationResult = validateLsArgs({
    commandName: 'env ls',
    args: args,
    maxArgs: 2,
    exitCode: 1,
    usageString: getCommandName(
      `env ls --environment ${getEnvTargetPlaceholder()} --git-branch <BRANCH>`
    ),
  });
  if (validationResult !== 0) {
    return validationResult;
  }

  telemetryClient.trackCliArgumentEnvironment(args[0]);
  telemetryClient.trackCliArgumentGitBranch(args[1]);
  telemetryClient.trackCliOptionEnvironment(flags['--environment']);
  telemetryClient.trackCliOptionGitBranch(flags['--git-branch']);

  const envTargetInput = resolveEnvTargetInput(client, {
    environment: flags['--environment'],
    gitBranch: flags['--git-branch'],
    legacyEnvironment: args[0],
    legacyGitBranch: args[1],
  });
  if ('error' in envTargetInput) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: envTargetInput.error,
        },
        2
      );
    }
    output.error(envTargetInput.error);
    return 2;
  }
  const { environment: envTarget, gitBranch: envGitBranch } = envTargetInput;
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  telemetryClient.trackCliFlagGuidance(flags['--guidance']);
  telemetryClient.trackCliOptionFormat(flags['--format']);
  const projectName = flags['--project'];
  telemetryClient.trackCliOptionProject(projectName);

  const sendEnvRequests = (client: Client, projectId: string) =>
    Promise.all([
      getEnvRecords(client, projectId, 'vercel-cli:env:ls', {
        target: envTarget,
        gitBranch: envGitBranch,
      }),
      getCustomEnvironments(client, projectId),
    ]);
  const { link, early } = await resolveProjectContextWithEnvRequests(
    client,
    { projectNameOrId: projectName, commandName: 'env ls' },
    sendEnvRequests
  );
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn’t linked to a project on Vercel. Pass --project <name>, or ${client.nonInteractive ? `run ${getCommandName('link --yes --team <team-id> --project <project-id>')} to link non-interactively.` : `run ${getCommandName('link')} to begin.`}`
    );
    return 1;
  }
  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project, org } = link;

  const lsStamp = stamp(early?.sentAt);

  const [envsResult, customEnvs] = await (early?.result() ??
    sendEnvRequests(client, project.id));
  const { envs } = envsResult;

  const projectSlugLink = formatProject(org.slug, project.name);

  if (asJson) {
    output.stopSpinner();
    const jsonOutput = {
      envs: envs.map(env => ({
        key: env.key,
        value: isSecretEnvVar(env) ? undefined : env.value,
        type: env.type,
        visibility: env.visibility,
        target: env.target,
        gitBranch: env.gitBranch,
        configurationId: env.configurationId,
        createdAt: env.createdAt,
        updatedAt: env.updatedAt,
      })),
    };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else if (envs.length === 0) {
    output.log(
      `No Environment Variables found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
    );
  } else {
    output.log(
      `Environment Variables found for ${projectSlugLink} ${chalk.gray(lsStamp())}`
    );
    client.stdout.write(`${getTable(link, envs, customEnvs)}\n`);
  }

  if (!asJson) {
    const { isAgent } = await determineAgent();
    const guidanceMode = isGuidanceEnabled(
      client,
      parsedArgs.flags['--guidance'],
      isAgent
    );
    if (guidanceMode) {
      suggestNextCommands([
        {
          description: 'Add an Environment Variable',
          command: withGlobalFlags(client, 'env add', {
            preserveProject: true,
          }),
        },
        {
          description: 'Remove an Environment Variable',
          command: withGlobalFlags(client, 'env remove', {
            preserveProject: true,
          }),
        },
        {
          description: 'Pull Development Environment Variables into .env.local',
          command: withGlobalFlags(client, 'env pull', {
            preserveProject: true,
          }),
        },
      ]);
    }
  }

  return 0;
}

function getTable(
  link: ProjectLinked,
  records: ProjectEnvVariable[],
  customEnvironments: CustomEnvironment[]
) {
  const label = records.some(env => env.gitBranch)
    ? 'environments (git branch)'
    : 'environments';
  return formatTable(
    ['name', 'value', 'type', label, 'created'],
    ['l', 'l', 'l', 'l', 'l'],
    [
      {
        name: '',
        rows: records.map(row => getRow(link, row, customEnvironments)),
      },
    ]
  );
}

function getRow(
  link: ProjectLinked,
  env: ProjectEnvVariable,
  customEnvironments: CustomEnvironment[]
) {
  let value: string;
  if (isSecretEnvVar(env)) {
    value = chalk.gray.italic('Hidden');
  } else if (env.type === 'system') {
    value = chalk.gray.italic(env.value);
  } else {
    // replace space characters (line-break, etc.) with simple spaces
    // to make sure the displayed value is a single line
    const singleLineValue = env.value.replace(/\s/g, ' ');

    value = chalk.gray(ellipsis(singleLineValue, 19));
  }

  const now = Date.now();
  return [
    chalk.bold(env.key),
    value,
    getEnvironmentVariableTypeLabel(env),
    formatEnvironments(link, env, customEnvironments),
    env.createdAt ? `${ms(now - env.createdAt)} ago` : '',
  ];
}

function getEnvironmentVariableTypeLabel(
  env: ProjectEnvVariable
): 'Config' | 'Secret' | 'System' {
  if (isSecretEnvVar(env)) {
    return 'Secret';
  }
  if (env.type === 'system') {
    return 'System';
  }
  return 'Config';
}
