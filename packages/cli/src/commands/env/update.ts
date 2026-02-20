import chalk from 'chalk';
import type Client from '../../util/client';
import stamp from '../../util/output/stamp';
import updateEnvRecord from '../../util/env/update-env-record';
import getEnvRecords from '../../util/env/get-env-records';
import { getEnvTargetPlaceholder } from '../../util/env/env-target';
import readStandardInput from '../../util/input/read-standard-input';
import param from '../../util/output/param';
import { emoji, prependEmoji } from '../../util/emoji';
import { isKnownError } from '../../util/env/known-error';
import { validateEnvValue } from '../../util/env/validate-env';
import formatEnvironments from '../../util/env/format-environments';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { getCustomEnvironments } from '../../util/target/get-custom-environments';
import output from '../../output-manager';
import { EnvUpdateTelemetryClient } from '../../util/telemetry/commands/env/update';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { updateSubcommand } from './command';
import { getLinkedProject } from '../../util/projects/link';
import type { ProjectEnvVariable } from '@vercel-internals/types';
import {
  outputActionRequired,
  outputAgentError,
  buildCommandWithYes,
  buildEnvUpdateCommandWithPreservedArgs,
  getPreservedArgsForEnvUpdate,
} from '../../util/agent-output';

export default async function update(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(updateSubcommand.options);
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

  const valueFromFlag =
    typeof opts['--value'] === 'string' ? opts['--value'] : undefined;
  const stdInput = await readStandardInput(client.stdin);
  // eslint-disable-next-line prefer-const
  let [envName, envTargetArg, envGitBranch] = args;

  const telemetryClient = new EnvUpdateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  telemetryClient.trackCliArgumentName(envName);
  telemetryClient.trackCliArgumentEnvironment(envTargetArg);
  telemetryClient.trackCliArgumentGitBranch(envGitBranch);
  telemetryClient.trackCliFlagSensitive(opts['--sensitive']);
  telemetryClient.trackCliFlagYes(opts['--yes']);
  telemetryClient.trackCliOptionValue(valueFromFlag);

  if (args.length > 3) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_arguments',
          message: `Invalid number of arguments. Usage: ${getCommandNamePlain(
            `env update <name> ${getEnvTargetPlaceholder()} <gitbranch>`
          )}`,
        },
        1
      );
    }
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env update <name> ${getEnvTargetPlaceholder()} <gitbranch>`
      )}`
    );
    return 1;
  }

  if (stdInput && (!envName || !envTargetArg)) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env update <name> <target> <gitbranch> < <file>`
      )}`
    );
    return 1;
  }

  // Non-interactive: report all missing requirements in one shot (like env add)
  if (client.nonInteractive) {
    const missing: string[] = [];
    if (!envName) missing.push('missing_name');
    if (!stdInput && valueFromFlag === undefined) missing.push('missing_value');
    if (missing.length > 0) {
      const parts = missing.map(m =>
        m === 'missing_name' ? 'name' : '--value or stdin'
      );
      // Production does not use branch; only preview/development use optional <gitbranch>
      const targetPart = envTargetArg || getEnvTargetPlaceholder();
      const branchPart =
        envTargetArg === 'preview' || envTargetArg === 'development'
          ? ' <gitbranch>'
          : '';
      const template = `env update ${envName || '<name>'} ${targetPart}${branchPart} --value <value> --yes`;
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_requirements',
          missing,
          message: `Provide all required inputs for non-interactive mode: ${parts.join('; ')}. Example: ${getCommandNamePlain(template)}`,
          next: [
            {
              command: buildEnvUpdateCommandWithPreservedArgs(
                client.argv,
                template
              ),
            },
          ],
        },
        1
      );
    }
  }

  const envTargets: string[] = [];
  if (envTargetArg) {
    envTargets.push(envTargetArg);
  }

  if (!envName) {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_name',
          message:
            'Provide the variable name as an argument. Example: vercel env update <name>',
          next: [
            {
              command: buildEnvUpdateCommandWithPreservedArgs(
                client.argv,
                `env update <name> ${getEnvTargetPlaceholder()} --value <value> --yes`
              ),
            },
          ],
        },
        1
      );
    } else {
      envName = await client.input.text({
        message: `What's the name of the variable to update?`,
        validate: val => (val ? true : 'Name cannot be empty'),
      });
    }
  }

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      const preserved = getPreservedArgsForEnvUpdate(client.argv).filter(
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
    }
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName(
        'link'
      )} to begin.`
    );
    return 1;
  }
  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;
  const { project } = link;
  const [{ envs }, customEnvironments] = await Promise.all([
    getEnvRecords(client, project.id, 'vercel-cli:env:update'),
    getCustomEnvironments(client, project.id),
  ]);

  const matchingEnvs = envs.filter(r => r.key === envName);

  if (matchingEnvs.length === 0) {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'env_not_found',
          message: `The variable ${envName} was not found. Run ${getCommandNamePlain(
            'env ls'
          )} to see all available Environment Variables.`,
        },
        1
      );
    }
    output.error(
      `The variable ${param(envName)} was not found. Run ${getCommandName(
        `env ls`
      )} to see all available Environment Variables.`
    );
    return 1;
  }

  let selectedEnv: ProjectEnvVariable;

  // If specific target and/or git branch is provided, filter matching envs
  if (envTargetArg || envGitBranch) {
    const filteredEnvs = matchingEnvs.filter(env => {
      const matchesTarget =
        !envTargetArg ||
        (Array.isArray(env.target)
          ? env.target.includes(envTargetArg as any)
          : env.target === envTargetArg) ||
        (env.customEnvironmentIds &&
          env.customEnvironmentIds.includes(envTargetArg));
      const matchesGitBranch = !envGitBranch || env.gitBranch === envGitBranch;
      return matchesTarget && matchesGitBranch;
    });

    if (filteredEnvs.length === 0) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'env_not_found',
            message: `No Environment Variable ${envName} found matching the specified target/branch.`,
          },
          1
        );
      }
      output.error(
        `No Environment Variable ${param(envName)} found matching the specified criteria.`
      );
      return 1;
    }

    if (filteredEnvs.length === 1) {
      selectedEnv = filteredEnvs[0];
    } else {
      if (client.nonInteractive) {
        outputActionRequired(
          client,
          {
            status: 'action_required',
            reason: 'multiple_envs',
            message: `Multiple Environment Variables match ${envName}. Specify target and/or branch to update one.`,
            next: [
              {
                command: buildEnvUpdateCommandWithPreservedArgs(
                  client.argv,
                  `env update ${envName} ${getEnvTargetPlaceholder()} <gitbranch>`
                ),
              },
            ],
          },
          1
        );
      }
      // Multiple matches, let user choose
      const choices = filteredEnvs.map((env, index) => {
        const targets = formatEnvironments(link, env, customEnvironments);
        return {
          name: targets,
          value: index,
        };
      });

      const selectedIndex = await client.input.select({
        message: `Multiple Environment Variables found for ${param(envName)}. Which one do you want to update?`,
        choices,
      });

      selectedEnv = filteredEnvs[selectedIndex];
    }
  } else if (matchingEnvs.length === 1) {
    selectedEnv = matchingEnvs[0];
  } else {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'multiple_envs',
          message: `Multiple Environment Variables match ${envName}. Specify target and/or branch to update one.`,
          next: [
            {
              command: buildEnvUpdateCommandWithPreservedArgs(
                client.argv,
                `env update ${envName} ${getEnvTargetPlaceholder()} <gitbranch>`
              ),
            },
          ],
        },
        1
      );
    }
    // Multiple environments without specific target, let user choose
    const choices = matchingEnvs.map((env, index) => {
      const targets = formatEnvironments(link, env, customEnvironments);
      return {
        name: targets,
        value: index,
      };
    });

    const selectedIndex = await client.input.select({
      message: `Multiple Environment Variables found for ${param(envName)}. Which one do you want to update?`,
      choices,
    });

    selectedEnv = matchingEnvs[selectedIndex];
  }

  let envValue: string;

  if (stdInput) {
    envValue = stdInput;
  } else if (valueFromFlag !== undefined) {
    envValue = valueFromFlag;
  } else {
    if (client.nonInteractive) {
      const branchPart =
        envTargetArg === 'preview' || envTargetArg === 'development'
          ? ' <gitbranch>'
          : '';
      const targetPart = envTargetArg || getEnvTargetPlaceholder();
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'missing_value',
          message:
            "In non-interactive mode provide the new value via --value or stdin. Example: vercel env update <name> <environment> --value 'value' --yes",
          next: [
            {
              command: buildEnvUpdateCommandWithPreservedArgs(
                client.argv,
                `env update ${envName} ${targetPart}${branchPart} --value <value> --yes`
              ),
            },
          ],
        },
        1
      );
    }
    envValue = await client.input.text({
      message: `What's the new value of ${envName}?`,
    });
  }

  const skipConfirm =
    opts['--yes'] || !!stdInput || valueFromFlag !== undefined;
  const { finalValue, alreadyConfirmed } = await validateEnvValue({
    envName,
    initialValue: envValue,
    skipConfirm,
    promptForValue: () =>
      client.input.text({ message: `What's the new value of ${envName}?` }),
    selectAction: choices =>
      client.input.select({ message: 'How to proceed?', choices }),
    showWarning: msg => output.warn(msg),
    showLog: msg => output.log(msg),
  });

  // Confirm the update unless --yes flag is provided or already confirmed from validation
  if (!opts['--yes'] && !alreadyConfirmed) {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'confirmation_required',
          message: `Updating Environment Variable ${envName}. Use --yes to confirm.`,
          next: [{ command: buildCommandWithYes(client.argv) }],
        },
        1
      );
    }
    const currentTargets = formatEnvironments(
      link,
      selectedEnv,
      customEnvironments
    );
    const confirmed = await client.input.confirm(
      `Updating Environment Variable ${param(envName)} in ${currentTargets} in Project ${chalk.bold(project.name)}. Are you sure?`,
      false
    );

    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  const type = opts['--sensitive'] ? 'sensitive' : selectedEnv.type;
  const targets = Array.isArray(selectedEnv.target)
    ? selectedEnv.target
    : [selectedEnv.target].filter((r): r is NonNullable<typeof r> =>
        Boolean(r)
      );
  const allTargets = [...targets, ...(selectedEnv.customEnvironmentIds || [])];

  const updateStamp = stamp();
  try {
    output.spinner('Updating');
    await updateEnvRecord(
      client,
      project.id,
      selectedEnv.id,
      type,
      envName,
      finalValue,
      allTargets,
      selectedEnv.gitBranch || ''
    );
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
      `Updated Environment Variable ${chalk.bold(envName)} in Project ${chalk.bold(
        project.name
      )} ${chalk.gray(updateStamp())}`,
      emoji('success')
    )}\n`
  );

  return 0;
}
