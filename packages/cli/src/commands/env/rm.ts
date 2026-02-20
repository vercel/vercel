import chalk from 'chalk';
import removeEnvRecord from '../../util/env/remove-env-record';
import getEnvRecords from '../../util/env/get-env-records';
import formatEnvironments from '../../util/env/format-environments';
import { getEnvTargetPlaceholder } from '../../util/env/env-target';
import type Client from '../../util/client';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';
import { emoji, prependEmoji } from '../../util/emoji';
import { isKnownError } from '../../util/env/known-error';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { getCustomEnvironments } from '../../util/target/get-custom-environments';
import { EnvRmTelemetryClient } from '../../util/telemetry/commands/env/rm';
import output from '../../output-manager';
import { removeSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import {
  outputActionRequired,
  outputAgentError,
  buildCommandWithYes,
  buildEnvRmCommandWithPreservedArgs,
  getPreservedArgsForEnvRm,
} from '../../util/agent-output';

export default async function rm(client: Client, argv: string[]) {
  const telemetryClient = new EnvRmTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(removeSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: err instanceof Error ? err.message : String(err),
        },
        1
      );
    }
    printError(err);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;

  if (args.length > 3) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: `Invalid number of arguments. Usage: ${getCommandNamePlain(
            `env rm <name> ${getEnvTargetPlaceholder()} <gitbranch>`
          )}`,
        },
        1
      );
    }
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env rm <name> ${getEnvTargetPlaceholder()} <gitbranch>`
      )}`
    );
    return 1;
  }

  // eslint-disable-next-line prefer-const
  let [envName, envTarget, envGitBranch] = args;
  telemetryClient.trackCliArgumentName(envName);
  telemetryClient.trackCliArgumentEnvironment(envTarget);
  telemetryClient.trackCliArgumentGitBranch(envGitBranch);
  telemetryClient.trackCliFlagYes(opts['--yes']);

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      const preserved = getPreservedArgsForEnvRm(client.argv).filter(
        a => a !== '--yes' && a !== '-y'
      );
      const linkArgv = [
        ...client.argv.slice(0, 2),
        'link',
        '--scope',
        '<scope>',
        ...preserved,
      ];
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'not_linked',
          message: `Your codebase isn't linked to a project on Vercel. Run ${getCommandNamePlain(
            'link'
          )} to begin. Use --yes for non-interactive; use --scope or --project to specify team or project.`,
          next: [
            { command: buildCommandWithYes(linkArgv) },
            { command: buildCommandWithYes(client.argv) },
          ],
        },
        1
      );
    } else {
      output.error(
        `Your codebase isn’t linked to a project on Vercel. Run ${getCommandName(
          'link'
        )} to begin.`
      );
    }
    return 1;
  }
  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;
  const { project } = link;

  if (!envName) {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_name',
          message:
            'Provide the variable name as an argument. Example: vercel env rm <name> --yes',
          next: [
            {
              command: buildEnvRmCommandWithPreservedArgs(
                client.argv,
                `env rm <name> ${getEnvTargetPlaceholder()} --yes`
              ),
            },
          ],
        },
        1
      );
    }
    envName = await client.input.text({
      message: "What's the name of the variable?",
      validate: val => (val ? true : 'Name cannot be empty'),
    });
  }

  const [result, customEnvironments] = await Promise.all([
    getEnvRecords(client, project.id, 'vercel-cli:env:rm', {
      target: envTarget,
      gitBranch: envGitBranch,
    }),
    getCustomEnvironments(client, project.id),
  ]);

  let envs = result.envs.filter(env => env.key === envName);

  if (envs.length === 0) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'env_not_found',
          message: `Environment Variable ${envName} was not found.`,
        },
        1
      );
    }
    output.error(`Environment Variable was not found.\n`);
    return 1;
  }

  while (envs.length > 1) {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'multiple_envs',
          message: `Multiple Environment Variables match ${envName}. Specify target and/or branch to remove one.`,
          next: [
            {
              command: buildEnvRmCommandWithPreservedArgs(
                client.argv,
                `env rm ${envName} ${getEnvTargetPlaceholder()} --yes`
              ),
            },
          ],
        },
        1
      );
    }
    const id = await client.input.select({
      message: `Remove ${envName} from which Environments?`,
      choices: envs.map(env => ({
        value: env.id,
        name: formatEnvironments(link, env, customEnvironments),
      })),
    });

    if (!id) {
      output.error('Please select at least one Environment Variable to remove');
    }
    envs = envs.filter(env => env.id === id);
  }
  const env = envs[0];

  const skipConfirmation = opts['--yes'];
  if (!skipConfirmation) {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'confirmation_required',
          message: `Removing Environment Variable ${env.key}. Use --yes to confirm.`,
          next: [{ command: buildCommandWithYes(client.argv) }],
        },
        1
      );
    }
    if (
      !(await client.input.confirm(
        `Removing Environment Variable ${param(env.key)} from ${formatEnvironments(
          link,
          env,
          customEnvironments
        )} in Project ${chalk.bold(project.name)}. Are you sure?`,
        false
      ))
    ) {
      output.log('Canceled');
      return 0;
    }
  }

  const rmStamp = stamp();

  try {
    output.spinner('Removing');
    await removeEnvRecord(client, project.id, env);
  } catch (err: unknown) {
    if (client.nonInteractive && isAPIError(err)) {
      const reason =
        (err as { slug?: string }).slug ||
        (err.serverMessage?.toLowerCase().includes('branch')
          ? 'branch_not_found'
          : 'api_error');
      outputAgentError(
        client,
        {
          status: 'error',
          reason,
          message: err.serverMessage,
        },
        1
      );
    }
    if (isAPIError(err) && isKnownError(err)) {
      output.error(err.serverMessage);
      return 1;
    }
    throw err;
  }

  output.print(
    `${prependEmoji(
      `Removed Environment Variable ${chalk.gray(rmStamp())}`,
      emoji('success')
    )}\n`
  );

  return 0;
}
