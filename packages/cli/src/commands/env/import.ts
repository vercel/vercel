import chalk from 'chalk';
import { readFile } from 'fs-extra';
import { resolve } from 'path';
import dotenv from 'dotenv';
import type Client from '../../util/client';
import addEnvRecord from '../../util/env/add-env-record';
import getEnvRecords from '../../util/env/get-env-records';
import {
  getEnvTargetPlaceholder,
  envTargetChoices,
} from '../../util/env/env-target';
import stamp from '../../util/output/stamp';
import param from '../../util/output/param';
import { emoji, prependEmoji } from '../../util/emoji';
import { isKnownError } from '../../util/env/known-error';
import { getCommandName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { getCustomEnvironments } from '../../util/target/get-custom-environments';
import output from '../../output-manager';
import { EnvImportTelemetryClient } from '../../util/telemetry/commands/env/import';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { importSubcommand } from './command';
import { getLinkedProject } from '../../util/projects/link';
import { resolveTypeForTarget } from './add';
import getTeamById from '../../util/teams/get-team-by-id';
import { isErrnoException } from '@vercel/error-utils';

export default async function importEnv(client: Client, argv: string[]) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(importSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags: opts } = parsedArgs;

  const telemetryClient = new EnvImportTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (args.length > 2) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env import <file> ${getEnvTargetPlaceholder()}`
      )}`
    );
    return 1;
  }

  let [filePath, envTargetArg] = args;

  telemetryClient.trackCliArgumentFile(filePath);
  telemetryClient.trackCliArgumentEnvironment(envTargetArg);
  telemetryClient.trackCliFlagForce(opts['--force']);
  telemetryClient.trackCliFlagYes(opts['--yes']);

  if (!filePath) {
    output.error(
      `Missing file argument. Usage: ${getCommandName(
        `env import <file> ${getEnvTargetPlaceholder()}`
      )}`
    );
    return 1;
  }

  // Read and parse the .env file
  const fullPath = resolve(client.cwd, filePath);
  let fileContents: string;
  try {
    fileContents = await readFile(fullPath, 'utf-8');
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      output.error(`The file ${param(filePath)} does not exist.`);
      return 1;
    }
    throw err;
  }

  const parsed = dotenv.parse(fileContents);
  const entries = Object.entries(parsed);

  if (entries.length === 0) {
    output.error(`No Environment Variables found in ${param(filePath)}.`);
    return 1;
  }

  // Link project
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

  // Resolve environment target
  const customEnvironments = await getCustomEnvironments(client, project.id);

  if (!envTargetArg) {
    const choices = [
      ...envTargetChoices.map(c => ({ name: c.name, value: c.value })),
      ...customEnvironments.map(c => ({ name: c.slug, value: c.id })),
    ];

    envTargetArg = await client.input.select({
      message: `Import Environment Variables to which Environment?`,
      choices,
    });
  }

  const envTargets = [envTargetArg];

  // Detect team-level sensitive env var policy
  let policyOn = false;
  if (link.org.type === 'team') {
    try {
      const team = await getTeamById(client, link.org.id);
      policyOn = team?.sensitiveEnvironmentVariablePolicy === 'on';
    } catch {
      // Non-fatal — policy detection is best-effort.
    }
  }

  const hasDevelopment = envTargets.includes('development');
  const finalType = resolveTypeForTarget(
    hasDevelopment ? 'development' : 'production',
    { forceSensitive: false, forceEncrypted: false, policyOn }
  );

  // Fetch existing env records to detect duplicates
  const { envs: existingEnvs } = await getEnvRecords(
    client,
    project.id,
    'vercel-cli:env:import',
    { target: envTargetArg }
  );

  const existingKeys = new Set<string>();
  for (const env of existingEnvs) {
    existingKeys.add(env.key);
  }

  const upsert = opts['--force'] ? 'true' : '';
  const skipConfirmation = opts['--yes'];

  // Confirmation prompt
  if (!skipConfirmation) {
    const confirmMessage = `Import ${chalk.bold(
      String(entries.length)
    )} Environment Variable${entries.length === 1 ? '' : 's'} to ${chalk.bold(
      envTargetArg
    )} for Project ${chalk.bold(project.name)}?`;

    if (!(await client.input.confirm(confirmMessage, true))) {
      output.log('Canceled');
      return 0;
    }
  }

  // Import variables sequentially
  const importStamp = stamp();
  let added = 0;
  let skipped = 0;
  let failed = 0;

  output.spinner('Importing');

  for (const [key, value] of entries) {
    if (existingKeys.has(key) && !upsert) {
      skipped++;
      continue;
    }

    try {
      await addEnvRecord(
        client,
        project.id,
        upsert,
        finalType,
        key,
        value,
        envTargets,
        ''
      );
      added++;
    } catch (err: unknown) {
      failed++;
      if (isAPIError(err) && isKnownError(err)) {
        output.warn(`Failed to import ${param(key)}: ${err.serverMessage}`);
      } else if (isAPIError(err)) {
        output.warn(
          `Failed to import ${param(key)}: ${err.serverMessage || err.message}`
        );
      } else {
        output.warn(
          `Failed to import ${param(key)}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  // Build summary parts
  const parts: string[] = [];
  if (added > 0) {
    parts.push(`${added} added`);
  }
  if (skipped > 0) {
    parts.push(`${skipped} skipped`);
  }
  if (failed > 0) {
    parts.push(`${failed} failed`);
  }
  const summary = parts.length > 0 ? ` (${parts.join(', ')})` : '';

  output.print(
    `${prependEmoji(
      `Imported Environment Variables${summary} to Project ${chalk.bold(
        project.name
      )} ${chalk.gray(importStamp())}`,
      emoji('success')
    )}\n`
  );

  if (skipped > 0 && !upsert) {
    output.log(
      `To overwrite existing variables, run ${getCommandName(
        `env import ${filePath} ${envTargetArg} --force`
      )}`
    );
  }

  return failed > 0 ? 1 : 0;
}
