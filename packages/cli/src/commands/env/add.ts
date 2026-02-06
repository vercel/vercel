import chalk from 'chalk';
import type Client from '../../util/client';
import stamp from '../../util/output/stamp';
import addEnvRecord from '../../util/env/add-env-record';
import getEnvRecords from '../../util/env/get-env-records';
import {
  getEnvTargetPlaceholder,
  envTargetChoices,
} from '../../util/env/env-target';
import readStandardInput from '../../util/input/read-standard-input';
import param from '../../util/output/param';
import { emoji, prependEmoji } from '../../util/emoji';
import { isKnownError } from '../../util/env/known-error';
import {
  getEnvKeyWarnings,
  removePublicPrefix,
  validateEnvValue,
} from '../../util/env/validate-env';
import { getCommandName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { getCustomEnvironments } from '../../util/target/get-custom-environments';
import output from '../../output-manager';
import { EnvAddTelemetryClient } from '../../util/telemetry/commands/env/add';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { addSubcommand } from './command';
import { getLinkedProject } from '../../util/projects/link';
import { determineAgent } from '@vercel/detect-agent';
import { suggestNextCommands } from '../../util/suggest-next-commands';
import { outputActionRequired } from '../../util/agent-output';

export default async function add(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags: opts } = parsedArgs;

  const stdInput = await readStandardInput(client.stdin);
  // eslint-disable-next-line prefer-const
  let [envName, envTargetArg, envGitBranch] = args;

  const telemetryClient = new EnvAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  telemetryClient.trackCliArgumentName(envName);
  telemetryClient.trackCliArgumentEnvironment(envTargetArg);
  telemetryClient.trackCliArgumentGitBranch(envGitBranch);
  telemetryClient.trackCliFlagSensitive(opts['--sensitive']);
  telemetryClient.trackCliFlagForce(opts['--force']);
  telemetryClient.trackCliFlagGuidance(opts['--guidance']);
  telemetryClient.trackCliFlagYes(opts['--yes']);

  if (args.length > 3) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add <name> ${getEnvTargetPlaceholder()} <gitbranch>`
      )}`
    );
    return 1;
  }

  if (stdInput && (!envName || !envTargetArg)) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add <name> <target> <gitbranch> < <file>`
      )}`
    );
    return 1;
  }

  let envTargets: string[] = [];
  if (envTargetArg) {
    envTargets.push(envTargetArg);
  }

  if (!envName) {
    if (client.nonInteractive) {
      outputActionRequired(client, {
        status: 'action_required',
        reason: 'missing_name',
        message: 'Provide the variable name as an argument.',
        next: [
          {
            command: getCommandName(
              `env add <name> ${getEnvTargetPlaceholder()} [git-branch] --yes`
            ),
          },
        ],
      });
    }
    envName = await client.input.text({
      message: `What's the name of the variable?`,
      validate: val => (val ? true : 'Name cannot be empty'),
    });
  }

  // Validate key name early (before value entry) with re-entry option
  const skipConfirm = opts['--yes'] || !!stdInput;
  if (!skipConfirm) {
    let keyAccepted = false;
    while (!keyAccepted) {
      const keyWarnings = getEnvKeyWarnings(envName);
      const sensitiveWarning = keyWarnings.find(w => w.requiresConfirmation);

      if (!sensitiveWarning) {
        // Non-sensitive public prefix: just show info, no action needed
        for (const w of keyWarnings) {
          output.warn(w.message);
        }
        keyAccepted = true;
        break;
      }

      if (client.nonInteractive) {
        const nameWithoutPrefix = removePublicPrefix(envName);
        outputActionRequired(client, {
          status: 'action_required',
          reason: 'env_key_sensitive',
          message: `Key ${envName} may expose sensitive data (public prefix). Use --yes to keep as is, or rename to ${nameWithoutPrefix}.`,
          choices: [
            { id: 'keep', name: 'Leave as is (use --yes)' },
            { id: 'rename', name: `Rename to ${nameWithoutPrefix}` },
          ],
          next: [
            {
              command: getCommandName(`env add ${envName} --yes`),
              when: 'Leave as is',
            },
            {
              command: getCommandName(`env add ${nameWithoutPrefix} --yes`),
              when: 'Rename',
            },
          ],
        });
      }

      // Sensitive public variable: show all warnings then options
      for (const w of keyWarnings) {
        output.warn(w.message);
      }

      const nameWithoutPrefix = removePublicPrefix(envName);
      const choices = [
        { name: 'Leave as is', value: 'c' },
        { name: `Rename to ${nameWithoutPrefix}`, value: 'p' },
        { name: 'Re-enter', value: 'r' },
      ];

      const action = await client.input.select({
        message: 'How to proceed?',
        choices,
      });

      if (action === 'c') {
        keyAccepted = true;
      } else if (action === 'p') {
        envName = nameWithoutPrefix;
        output.log(`Renamed to ${envName}`);
        // Loop back to re-validate (might have nested prefix)
      } else {
        envName = await client.input.text({
          message: `What's the name of the variable?`,
          validate: val => (val ? true : 'Name cannot be empty'),
        });
      }
    }
  } else {
    // Non-interactive: just show warnings
    const keyWarnings = getEnvKeyWarnings(envName);
    for (const w of keyWarnings) {
      output.warn(w.message);
    }
  }

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn’t linked to a project on Vercel. Run ${getCommandName(
        'link'
      )} to begin.`
    );
    return 1;
  }
  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;
  const { project } = link;
  const [{ envs }, customEnvironments] = await Promise.all([
    getEnvRecords(client, project.id, 'vercel-cli:env:add'),
    getCustomEnvironments(client, project.id),
  ]);
  const matchingEnvs = envs.filter(r => r.key === envName);
  const existingTargets = new Set<string>();
  const existingCustomEnvs = new Set<string>();
  for (const env of matchingEnvs) {
    if (typeof env.target === 'string') {
      existingTargets.add(env.target);
    } else if (Array.isArray(env.target)) {
      for (const target of env.target) {
        existingTargets.add(target);
      }
    }
    if (env.customEnvironmentIds) {
      for (const customEnvId of env.customEnvironmentIds) {
        existingCustomEnvs.add(customEnvId);
      }
    }
  }
  const choices = [
    ...envTargetChoices.filter(c => !existingTargets.has(c.value)),
    ...customEnvironments
      .filter(c => !existingCustomEnvs.has(c.id))
      .map(c => ({
        name: c.slug,
        value: c.id,
      })),
  ];

  if (!envGitBranch && choices.length === 0 && !opts['--force']) {
    output.error(
      `The variable ${param(
        envName
      )} has already been added to all Environments. To remove, run ${getCommandName(
        `env rm ${envName}`
      )}.`
    );
    return 1;
  }

  let type: 'encrypted' | 'sensitive' = opts['--sensitive']
    ? 'sensitive'
    : 'encrypted';
  let envValue: string;

  if (stdInput) {
    envValue = stdInput;
  } else {
    if (client.nonInteractive) {
      outputActionRequired(client, {
        status: 'action_required',
        reason: 'missing_value',
        message:
          'In non-interactive mode provide the value via stdin. Example: echo -n "value" | vercel env add <name> <environment> --yes',
        next: [
          {
            command: getCommandName(
              `env add <name> ${getEnvTargetPlaceholder()} --yes`
            ),
          },
        ],
      });
    }
    if (type === 'encrypted') {
      const isSensitive = await client.input.confirm(
        `Your value will be encrypted. Mark as sensitive?`,
        false
      );
      if (isSensitive) {
        type = 'sensitive';
      }
    }
    envValue = await client.input.password({
      message: `What's the value of ${envName}?`,
      mask: true,
    });
  }

  const { finalValue } = await validateEnvValue({
    envName,
    initialValue: envValue,
    skipConfirm,
    promptForValue: () =>
      client.input.password({
        message: `What's the value of ${envName}?`,
        mask: true,
      }),
    selectAction: choices =>
      client.input.select({ message: 'How to proceed?', choices }),
    showWarning: msg => output.warn(msg),
    showLog: msg => output.log(msg),
  });

  while (envTargets.length === 0) {
    if (client.nonInteractive && choices.length > 0) {
      outputActionRequired(client, {
        status: 'action_required',
        reason: 'missing_environment',
        message: `Specify at least one environment. Add as argument or use: ${getCommandName(
          `env add ${envName} <environment> --yes`
        )}`,
        choices: choices.map(c => ({
          id: c.value,
          name: typeof c.name === 'string' ? c.name : c.value,
        })),
        next: choices.slice(0, 5).map(c => ({
          command: getCommandName(`env add ${envName} ${c.value} --yes`),
        })),
      });
    }
    envTargets = await client.input.checkbox({
      message: `Add ${envName} to which Environments (select multiple)?`,
      choices,
    });

    if (envTargets.length === 0) {
      output.error('Please select at least one Environment');
    }
  }

  if (
    !stdInput &&
    !envGitBranch &&
    envTargets.length === 1 &&
    envTargets[0] === 'preview'
  ) {
    if (client.nonInteractive) {
      envGitBranch = '';
    } else {
      envGitBranch = await client.input.text({
        message: `Add ${envName} to which Git branch? (leave empty for all Preview branches)?`,
      });
    }
  }

  const upsert = opts['--force'] ? 'true' : '';

  const addStamp = stamp();
  try {
    output.spinner('Saving');
    await addEnvRecord(
      client,
      project.id,
      upsert,
      type,
      envName,
      finalValue,
      envTargets,
      envGitBranch
    );
  } catch (err: unknown) {
    if (isAPIError(err) && isKnownError(err)) {
      output.error(err.serverMessage);
      return 1;
    }
    throw err;
  }

  output.print(
    `${prependEmoji(
      `${
        opts['--force'] ? 'Overrode' : 'Added'
      } Environment Variable ${chalk.bold(envName)} to Project ${chalk.bold(
        project.name
      )} ${chalk.gray(addStamp())}`,
      emoji('success')
    )}\n`
  );

  const { isAgent } = await determineAgent();
  const guidanceMode = parsedArgs.flags['--guidance'] ?? isAgent;

  if (guidanceMode) {
    suggestNextCommands([getCommandName(`env ls`), getCommandName(`env pull`)]);
  }

  return 0;
}
