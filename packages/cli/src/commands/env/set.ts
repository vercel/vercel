import chalk from 'chalk';
import type Client from '../../util/client';
import stamp from '../../util/output/stamp';
import addEnvRecord from '../../util/env/add-env-record';
import updateEnvRecord from '../../util/env/update-env-record';
import getEnvRecords from '../../util/env/get-env-records';
import {
  getEnvTargetPlaceholder,
  envTargetChoices,
} from '../../util/env/env-target';
import readStandardInput from '../../util/input/read-standard-input';
import { emoji, prependEmoji } from '../../util/emoji';
import { isKnownError } from '../../util/env/known-error';
import { getCommandName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { getCustomEnvironments } from '../../util/target/get-custom-environments';
import output from '../../output-manager';
import { EnvSetTelemetryClient } from '../../util/telemetry/commands/env/set';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { setSubcommand } from './command';
import { getLinkedProject } from '../../util/projects/link';
import { determineAgent } from '@vercel/detect-agent';
import { suggestNextCommands } from '../../util/suggest-next-commands';
import type { ProjectEnvVariable } from '@vercel-internals/types';

export default async function set(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(setSubcommand.options);
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

  const telemetryClient = new EnvSetTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  telemetryClient.trackCliArgumentName(envName);
  telemetryClient.trackCliArgumentEnvironment(envTargetArg);
  telemetryClient.trackCliArgumentGitBranch(envGitBranch);
  telemetryClient.trackCliFlagSensitive(opts['--sensitive']);
  telemetryClient.trackCliFlagGuidance(opts['--guidance']);

  if (args.length > 3) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env set <name> ${getEnvTargetPlaceholder()} <gitbranch>`
      )}`
    );
    return 1;
  }

  if (stdInput && (!envName || !envTargetArg)) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env set <name> <target> <gitbranch> < <file>`
      )}`
    );
    return 1;
  }

  let envTargets: string[] = [];
  if (envTargetArg) {
    envTargets.push(envTargetArg);
  }

  if (!envName) {
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
    getEnvRecords(client, project.id, 'vercel-cli:env:set'),
    getCustomEnvironments(client, project.id),
  ]);

  // Find existing env variable that matches the name
  const matchingEnvs = envs.filter(r => r.key === envName);

  // Find if there's an existing env var for the specified target/branch
  let existingEnv: ProjectEnvVariable | undefined;

  if (envTargetArg || envGitBranch) {
    // Filter by target and/or branch
    existingEnv = matchingEnvs.find(env => {
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
  } else if (matchingEnvs.length === 1) {
    // Single matching env, use it
    existingEnv = matchingEnvs[0];
  }

  const isUpdate = Boolean(existingEnv);

  // Build choices for target selection (only show if not updating an existing var)
  const choices = [
    ...envTargetChoices,
    ...customEnvironments.map(c => ({
      name: c.slug,
      value: c.id,
    })),
  ];

  let type: 'encrypted' | 'sensitive' = opts['--sensitive']
    ? 'sensitive'
    : isUpdate && existingEnv?.type === 'sensitive'
      ? 'sensitive'
      : 'encrypted';
  let envValue: string;

  if (stdInput) {
    envValue = stdInput;
  } else {
    // Only ask about sensitivity for new variables when target is not fully specified
    // When both target and branch are specified, skip the prompt for a faster workflow
    if (type === 'encrypted' && !isUpdate && !envGitBranch) {
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

  // If no target specified and creating new, ask for targets
  if (!isUpdate && envTargets.length === 0) {
    while (envTargets.length === 0) {
      envTargets = await client.input.checkbox({
        message: `Add ${envName} to which Environments (select multiple)?`,
        choices,
      });

      if (envTargets.length === 0) {
        output.error('Please select at least one Environment');
      }
    }
  }

  // If creating new with single preview target and no branch specified
  if (
    !isUpdate &&
    !stdInput &&
    !envGitBranch &&
    envTargets.length === 1 &&
    envTargets[0] === 'preview'
  ) {
    envGitBranch = await client.input.text({
      message: `Add ${envName} to which Git branch? (leave empty for all Preview branches)?`,
    });
  }

  const actionStamp = stamp();
  try {
    output.spinner('Saving');

    if (isUpdate && existingEnv) {
      // Update existing env variable
      const targets = Array.isArray(existingEnv.target)
        ? existingEnv.target
        : [existingEnv.target].filter((r): r is NonNullable<typeof r> =>
            Boolean(r)
          );
      const allTargets = [
        ...targets,
        ...(existingEnv.customEnvironmentIds || []),
      ];

      await updateEnvRecord(
        client,
        project.id,
        existingEnv.id,
        type,
        envName,
        envValue,
        allTargets,
        existingEnv.gitBranch || ''
      );
    } else {
      // Create new env variable with upsert=true
      await addEnvRecord(
        client,
        project.id,
        'true', // upsert
        type,
        envName,
        envValue,
        envTargets,
        envGitBranch || ''
      );
    }
  } catch (err: unknown) {
    if (isAPIError(err) && isKnownError(err)) {
      output.error(err.serverMessage);
      return 1;
    }
    throw err;
  }

  const actionWord = isUpdate ? 'Updated' : 'Added';
  output.print(
    `${prependEmoji(
      `${actionWord} Environment Variable ${chalk.bold(envName)} to Project ${chalk.bold(
        project.name
      )} ${chalk.gray(actionStamp())}`,
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
