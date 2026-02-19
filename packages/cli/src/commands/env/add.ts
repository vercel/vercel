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
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
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
import {
  outputActionRequired,
  outputAgentError,
  buildCommandWithYes,
  buildEnvAddCommandWithPreservedArgs,
  getPreservedArgsForEnvAdd,
} from '../../util/agent-output';

/**
 * Ensures --git-branch has a value so the arg parser does not consume the next flag.
 * When the user passes --git-branch '' the shell may drop the empty string; when
 * the next token is a flag (e.g. --yes) we insert '' so "all Preview branches" is preserved.
 */
function normalizeEnvAddArgv(argv: string[]): string[] {
  const gbIdx = argv.indexOf('--git-branch');
  if (gbIdx === -1) return argv;
  const next = argv[gbIdx + 1];
  if (next === undefined || next.startsWith('-')) {
    return [...argv.slice(0, gbIdx + 1), '', ...argv.slice(gbIdx + 1)];
  }
  return argv;
}

export default async function add(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  const argvToParse = normalizeEnvAddArgv(argv);
  try {
    parsedArgs = parseArguments(argvToParse, flagsSpecification);
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

  const stdInput = await readStandardInput(client.stdin);
  const valueFromFlag =
    typeof opts['--value'] === 'string' ? opts['--value'] : undefined;
  // eslint-disable-next-line prefer-const
  let [envName, envTargetArg, envGitBranch] = args;
  if (envGitBranch === undefined && typeof opts['--git-branch'] === 'string') {
    envGitBranch = opts['--git-branch'];
  }

  const telemetryClient = new EnvAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  telemetryClient.trackCliArgumentName(envName);
  telemetryClient.trackCliArgumentEnvironment(envTargetArg);
  telemetryClient.trackCliOptionGitBranch(opts['--git-branch'] ?? envGitBranch);
  telemetryClient.trackCliOptionValue(opts['--value']);
  telemetryClient.trackCliFlagSensitive(opts['--sensitive']);
  telemetryClient.trackCliFlagForce(opts['--force']);
  telemetryClient.trackCliFlagGuidance(opts['--guidance']);
  telemetryClient.trackCliFlagYes(opts['--yes']);

  if (args.length > 3) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add <name> ${getEnvTargetPlaceholder()} <branch>`
      )}`
    );
    return 1;
  }

  if (stdInput && (!envName || !envTargetArg)) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add <name> <target> <branch> <file>`
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
            command: buildEnvAddCommandWithPreservedArgs(
              client.argv,
              `env add <name> ${getEnvTargetPlaceholder()} --value <value> --yes`
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
  const skipConfirm =
    opts['--yes'] || !!stdInput || valueFromFlag !== undefined;
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
              command: buildEnvAddCommandWithPreservedArgs(
                client.argv,
                `env add ${envName} ${getEnvTargetPlaceholder()} --value <value> --yes`
              ),
              when: 'Leave as is',
            },
            {
              command: buildEnvAddCommandWithPreservedArgs(
                client.argv,
                `env add ${nameWithoutPrefix} ${getEnvTargetPlaceholder()} --value <value> --yes`
              ),
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
    if (client.nonInteractive) {
      const preserved = getPreservedArgsForEnvAdd(client.argv);
      const linkPreserved = preserved.filter((a, i) => {
        if (a === '--value') return false;
        if (a.startsWith('--value=')) return false;
        if (i > 0 && preserved[i - 1] === '--value') return false;
        return true;
      });
      // Only add scope/project placeholders when project is not linked
      const linkArgv = [
        ...client.argv.slice(0, 2),
        'link',
        ...(link.status === 'not_linked'
          ? ['--scope', '<scope>', '--project', '<project>']
          : []),
        ...linkPreserved,
      ];
      let envAddRetryArgv = client.argv;
      if (envTargetArg === 'preview' && !client.argv.includes('--git-branch')) {
        const args = client.argv.slice(2);
        const previewIdx = args.indexOf('preview');
        if (previewIdx !== -1) {
          envAddRetryArgv = [
            ...client.argv.slice(0, previewIdx + 3),
            '--git-branch',
            '<branch>',
            ...client.argv.slice(previewIdx + 3),
          ];
        }
      }
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'not_linked',
          message: `Your codebase isn't linked to a project on Vercel. Run ${getCommandNamePlain(
            'link'
          )} to begin. Use --yes for non-interactive; use --project and --scope to specify project and team. Then run your env add command.`,
          next: [
            { command: buildCommandWithYes(linkArgv) },
            { command: buildCommandWithYes(envAddRetryArgv) },
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
  } else if (valueFromFlag !== undefined) {
    envValue = valueFromFlag;
  } else {
    if (client.nonInteractive) {
      outputActionRequired(client, {
        status: 'action_required',
        reason: 'missing_value',
        message:
          "In non-interactive mode provide the value via --value or stdin. Example: vercel env add <name> <environment> --value 'value' --yes",
        next: [
          {
            command: buildEnvAddCommandWithPreservedArgs(
              client.argv,
              `env add <name> ${getEnvTargetPlaceholder()} --value <value> --yes`
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
        message: `Specify at least one environment. Add as argument or use: ${buildEnvAddCommandWithPreservedArgs(
          client.argv,
          `env add ${envName} <environment> --value <value> --yes`
        )}`,
        choices: choices.map(c => ({
          id: c.value,
          name: typeof c.name === 'string' ? c.name : c.value,
        })),
        next: choices.slice(0, 5).map(c => ({
          command: buildEnvAddCommandWithPreservedArgs(
            client.argv,
            `env add ${envName} ${c.value} --value <value> --yes`
          ),
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
    envGitBranch === undefined &&
    envTargets.length === 1 &&
    envTargets[0] === 'preview'
  ) {
    if (client.nonInteractive) {
      outputActionRequired(
        client,
        {
          status: 'action_required',
          reason: 'git_branch_required',
          message: `Add ${envName} to which Git branch for Preview? Pass --git-branch <branch> or use an empty value for all Preview branches.`,
          next: [
            {
              command: buildEnvAddCommandWithPreservedArgs(
                client.argv,
                `env add ${envName} preview --value <value> --git-branch <branch> --yes`
              ),
              when: 'Add to a specific Git branch',
            },
            {
              command: buildEnvAddCommandWithPreservedArgs(
                client.argv,
                `env add ${envName} preview --value <value> --git-branch= --yes`
              ),
              when: 'Add to all Preview branches',
            },
          ],
        },
        1
      );
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
