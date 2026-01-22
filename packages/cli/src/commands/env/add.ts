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
import readAllStdin from '../../util/input/read-all-stdin';
import param from '../../util/output/param';
import { emoji, prependEmoji } from '../../util/emoji';
import { isKnownError } from '../../util/env/known-error';
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
import { readFile } from 'fs/promises';

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

  // Global non-interactive detection
  const nonInteractive =
    client.argv.includes('--non-interactive') ||
    process.env.VERCEL_NON_INTERACTIVE === '1' ||
    !client.stdin.isTTY ||
    !client.stdout.isTTY;

  // Back-compat: detect piped stdin only if present, unless --value-stdin is set
  const stdInput =
    opts['--value-stdin'] === true
      ? // Read entire stdin as raw bytes (do not trim)
        (await readAllStdin(client.stdin)).toString()
      : await readStandardInput(client.stdin);
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
  // Track new flags (best-effort; values redacted where appropriate)
  {
    const tf = opts['--target'] as string | string[] | undefined;
    if (Array.isArray(tf) && tf.length > 0) {
      telemetryClient.trackCliOptionTarget([tf[0]]);
    } else if (typeof tf === 'string') {
      telemetryClient.trackCliOptionTarget([tf]);
    }
    if (typeof opts['--git-branch'] === 'string') {
      telemetryClient.trackCliOptionGitBranch(opts['--git-branch']);
    }
    if (typeof opts['--value'] === 'string') {
      telemetryClient.trackCliOptionValue(opts['--value']);
    }
    if (typeof opts['--value-file'] === 'string') {
      telemetryClient.trackCliOptionValueFile(opts['--value-file']);
    }
    if (opts['--value-stdin']) {
      telemetryClient.trackCliFlagValueStdin(true);
    }
    if (opts['--replace']) {
      telemetryClient.trackCliFlagReplace(true);
    }
  }

  // Validate mutual exclusivity of value flags
  const valueFlags = [
    opts['--value'] ? 1 : 0,
    opts['--value-file'] ? 1 : 0,
    opts['--value-stdin'] ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  if (valueFlags > 1) {
    output.error(
      `Please specify only one of ${param(
        '--value'
      )}, ${param('--value-file')}, or ${param('--value-stdin')}.`
    );
    return 1;
  }

  if (args.length > 3) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add <name> ${getEnvTargetPlaceholder()} <gitbranch>`
      )}`
    );
    return 1;
  }

  if (stdInput && (!envName || !envTargetArg) && !opts['--target']) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env add <name> <target> <gitbranch> < <file>`
      )}`
    );
    return 1;
  }

  let envTargets: string[] = [];
  const targetFlag = opts['--target'] as string | string[] | undefined;
  if (Array.isArray(targetFlag)) {
    envTargets.push(...targetFlag);
  } else if (typeof targetFlag === 'string') {
    envTargets.push(targetFlag);
  } else if (envTargetArg) {
    envTargets.push(envTargetArg);
  }

  if (!envName) {
    if (nonInteractive) {
      output.error(
        `Missing required ${param(
          'name'
        )}. In non-interactive mode, provide it as a positional argument.`
      );
      return 1;
    }
    envName = await client.input.text({
      message: `What's the name of the variable?`,
      validate: val => (val ? true : 'Name cannot be empty'),
    });
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
  let envValue: string | undefined;

  // Prefer flag-provided git branch when available
  if (!envGitBranch && typeof opts['--git-branch'] === 'string') {
    envGitBranch = opts['--git-branch'] as string;
  }

  // Resolve the env value from flags/stdin or prompt
  if (typeof opts['--value'] === 'string') {
    envValue = opts['--value'] as string;
  } else if (typeof opts['--value-file'] === 'string') {
    try {
      const buf = await readFile(opts['--value-file'] as string);
      envValue = buf.toString();
    } catch (err) {
      output.error(`Failed to read ${param('--value-file')}: ${String(err)}`);
      return 1;
    }
  } else if (opts['--value-stdin']) {
    // Accept empty values for parity with --value and --value-file
    envValue = stdInput;
  } else if (stdInput) {
    // Back-compat: if a value is piped without --value-stdin, treat it as the value
    envValue = stdInput;
  } else {
    if (type === 'encrypted' && !nonInteractive) {
      const isSensitive = await client.input.confirm(
        `Your value will be encrypted. Mark as sensitive?`,
        false
      );
      if (isSensitive) {
        type = 'sensitive';
      }
    }
    if (!envValue) {
      if (nonInteractive) {
        output.error(
          `Missing value. Provide one of ${param(
            '--value'
          )}, ${param('--value-file')}, or ${param('--value-stdin')} in non-interactive mode.`
        );
        return 1;
      }
      envValue = await client.input.password({
        message: `What's the value of ${envName}?`,
        mask: true,
      });
    }
  }

  while (envTargets.length === 0) {
    if (nonInteractive) {
      output.error(
        `Missing ${param(
          '--target'
        )}. Provide at least one environment target in non-interactive mode.`
      );
      return 1;
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
    if (!nonInteractive) {
      envGitBranch = await client.input.text({
        message: `Add ${envName} to which Git branch? (leave empty for all Preview branches)?`,
      });
    }
  }

  // Support `--replace` as an alias for `--force`
  const upsert = opts['--force'] || opts['--replace'] ? 'true' : '';

  const addStamp = stamp();
  try {
    output.spinner('Saving');
    await addEnvRecord(
      client,
      project.id,
      upsert,
      type,
      envName,
      envValue,
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
