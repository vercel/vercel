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
import formatEnvironments from '../../util/env/format-environments';
import { getCommandName } from '../../util/pkg-name';
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

export default async function update(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(updateSubcommand.options);
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

  if (args.length > 3) {
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

  const envTargets: string[] = [];
  if (envTargetArg) {
    envTargets.push(envTargetArg);
  }

  if (!envName) {
    envName = await client.input.text({
      message: `What's the name of the variable to update?`,
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
    getEnvRecords(client, project.id, 'vercel-cli:env:update'),
    getCustomEnvironments(client, project.id),
  ]);

  const matchingEnvs = envs.filter(r => r.key === envName);

  if (matchingEnvs.length === 0) {
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
      output.error(
        `No Environment Variable ${param(envName)} found matching the specified criteria.`
      );
      return 1;
    }

    if (filteredEnvs.length === 1) {
      selectedEnv = filteredEnvs[0];
    } else {
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
  } else {
    envValue = await client.input.text({
      message: `What's the new value of ${envName}?`,
    });
  }

  // Confirm the update unless --yes flag is provided
  if (!opts['--yes']) {
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
      envValue,
      allTargets,
      selectedEnv.gitBranch || ''
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
      `Updated Environment Variable ${chalk.bold(envName)} in Project ${chalk.bold(
        project.name
      )} ${chalk.gray(updateStamp())}`,
      emoji('success')
    )}\n`
  );

  return 0;
}
