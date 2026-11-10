import chalk from 'chalk';
import removeEnvRecord from '../../util/env/remove-env-record';
import getEnvRecords from '../../util/env/get-env-records';
import formatEnvironments from '../../util/env/format-environments';
import {
  getEnvTargetPlaceholder,
  resolveEnvTargetInput,
} from '../../util/env/env-target';
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
import { resolveProjectContext } from '../../util/projects/resolve-project-context';
import {
  outputActionRequired,
  outputAgentError,
  buildCommandWithYes,
  buildEnvRmCommandWithPreservedArgs,
  getLinkSuggestionArgs,
  getPreservedArgsForEnvRm,
} from '../../util/agent-output';
import { getPublicPrefix } from '../../util/env/validate-env';
import { shouldConfirmRotationBeforeDelete } from '../../util/env/secret-detection';

function printEnvRmWarning(message: string): void {
  output.print(`${chalk.yellow('!')} ${message}\n`);
}

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
        2
      );
    }
    printError(err);
    return 2;
  }
  const { args, flags: opts } = parsedArgs;

  if (args.length > 3) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: `Invalid number of arguments. Usage: \`${getCommandNamePlain(
            `env remove <name> --environment ${getEnvTargetPlaceholder()} --git-branch <BRANCH>`
          )}\``,
        },
        2
      );
    }
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env remove <name> --environment ${getEnvTargetPlaceholder()} --git-branch <BRANCH>`
      )}`
    );
    return 2;
  }

  let [envName] = args;
  telemetryClient.trackCliArgumentName(envName);
  telemetryClient.trackCliArgumentEnvironment(args[1]);
  telemetryClient.trackCliArgumentGitBranch(args[2]);
  telemetryClient.trackCliOptionEnvironment(opts['--environment']);
  telemetryClient.trackCliOptionGitBranch(opts['--git-branch']);
  telemetryClient.trackCliFlagYes(opts['--yes']);
  telemetryClient.trackCliOptionProject(opts['--project']);

  const envTargetInput = resolveEnvTargetInput(client, {
    environment: opts['--environment'],
    gitBranch: opts['--git-branch'],
    legacyEnvironment: args[1],
    legacyGitBranch: args[2],
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

  // An empty `--environment` (often an unset `$ENVIRONMENT` in a script) must
  // not fall back to "no filter": that removes the whole variable, from every
  // environment it covers. Omitting the option still does that on purpose.
  if (opts['--environment'] === '') {
    const message =
      "Can't remove an Environment Variable with an empty --environment. Pass an environment, or leave out --environment to remove the variable from all of its environments.";
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_environment',
          message,
        },
        2
      );
    }
    output.error(message);
    return 2;
  }

  const link = await resolveProjectContext({
    client,
    projectNameOrId: opts['--project'],
  });
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
        ...getLinkSuggestionArgs(preserved),
      ];
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'not_linked',
          message: `Your codebase isn't linked to a project on Vercel. Run \`${getCommandNamePlain(
            'link'
          )}\` to begin. Use \`--yes\` for non-interactive; use \`--scope\` or \`--project\` to specify team or project.`,
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
            'Provide the variable name as an argument. Example: `vercel env remove <name> --yes`',
          next: [
            {
              command: buildEnvRmCommandWithPreservedArgs(
                client.argv,
                `env remove <name> --environment ${getEnvTargetPlaceholder()} --yes`
              ),
            },
          ],
        },
        2
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
          message: `Multiple Environment Variables match ${envName}. Specify --environment and/or --git-branch to remove one.`,
          next: [
            {
              command: buildEnvRmCommandWithPreservedArgs(
                client.argv,
                `env remove ${envName} --environment ${getEnvTargetPlaceholder()} --yes`
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
  const targets = Array.isArray(env.target)
    ? env.target
    : env.target
      ? [env.target]
      : [];
  const customEnvironmentIds = env.customEnvironmentIds ?? [];
  const selectedTarget =
    customEnvironments.find(
      environment =>
        environment.id === envTarget || environment.slug === envTarget
    )?.id ?? envTarget;
  if (
    envTarget &&
    !targets.includes(selectedTarget as (typeof targets)[number]) &&
    !customEnvironmentIds.includes(selectedTarget!)
  ) {
    output.error(
      'The selected environment does not match this variable. No changes were made.'
    );
    return 1;
  }
  const removesTargetOnly =
    Boolean(envTarget) && targets.length + customEnvironmentIds.length > 1;
  const confirmationEnv = envTarget
    ? {
        ...env,
        target: targets.filter(target => target === selectedTarget),
        customEnvironmentIds: customEnvironmentIds.filter(
          id => id === selectedTarget
        ),
      }
    : env;

  const shouldWarnAboutRotation = shouldConfirmRotationBeforeDelete({
    key: env.key,
    type: env.type,
    hasPublicPrefix: getPublicPrefix(env.key) !== null,
  });
  const rotationWarning =
    'Removing this variable from Vercel does not revoke the credential. Rotate or disable it at its provider.';
  if (shouldWarnAboutRotation) {
    printEnvRmWarning(rotationWarning);
  }

  const skipConfirmation = opts['--yes'];
  if (!skipConfirmation) {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'confirmation_required',
          message: `Removing Environment Variable ${env.key}. ${
            shouldWarnAboutRotation ? `${rotationWarning} ` : ''
          }Use --yes to confirm.`,
          next: [{ command: buildCommandWithYes(client.argv) }],
        },
        1
      );
    }
    if (
      !(await client.input.confirm(
        `Remove ${param(env.key)} from ${formatEnvironments(
          link,
          confirmationEnv,
          customEnvironments
        )} in Project ${chalk.bold(project.name)}?`,
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
    if (removesTargetOnly) {
      // PATCH the existing record with its remaining targets.
      // DELETE by ID would remove the entire shared record.
      await client.fetch(`/v10/projects/${project.id}/env/${env.id}`, {
        method: 'PATCH',
        body: {
          target: targets.filter(target => target !== selectedTarget),
          customEnvironmentIds: customEnvironmentIds.filter(
            id => id !== selectedTarget
          ),
        },
      });
    } else {
      await removeEnvRecord(client, project.id, env);
    }
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
      `${removesTargetOnly ? `Removed ${envTarget} target from Environment Variable` : 'Removed Environment Variable'} ${chalk.gray(rmStamp())}`,
      emoji('success')
    )}\n`
  );

  return 0;
}
