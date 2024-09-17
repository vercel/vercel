import chalk from 'chalk';
import Client from '../../util/client';
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
import { getCommandName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { getCustomEnvironments } from '../../util/target/get-custom-environments';
import type { ProjectLinked } from '@vercel-internals/types';

type Options = {
  '--debug': boolean;
  '--sensitive': boolean;
  '--force': boolean;
};

export default async function add(
  client: Client,
  link: ProjectLinked,
  opts: Partial<Options>,
  args: string[]
) {
  const { output } = client;
  const { project } = link;
  const stdInput = await readStandardInput(client.stdin);
  let [envName, envTargetArg, envGitBranch] = args;

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
    envName = await client.input.text({
      message: `What's the name of the variable?`,
      validate: val => (val ? true : 'Name cannot be empty'),
    });
  }

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
        name: c.name,
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

  let envValue: string;

  if (stdInput) {
    envValue = stdInput;
  } else {
    envValue = await client.input.text({
      message: `What's the value of ${envName}?`,
    });
  }

  while (envTargets.length === 0) {
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
    envGitBranch = await client.input.text({
      message: `Add ${envName} to which Git branch? (leave empty for all Preview branches)?`,
    });
  }

  const type = opts['--sensitive'] ? 'sensitive' : 'encrypted';
  const upsert = opts['--force'] ? 'true' : '';

  const addStamp = stamp();
  try {
    output.spinner('Saving');
    await addEnvRecord(
      output,
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

  return 0;
}
