import { resolve } from 'path';
import { access, readFile, writeFile } from 'fs/promises';
import chalk from 'chalk';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { CronsAddTelemetryClient } from '../../util/telemetry/commands/crons/add';
import { addSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { VERCEL_CONFIG_EXTENSIONS } from '../../util/compile-vercel-config';
import { isVercelTomlEnabled } from '../../util/is-vercel-toml-enabled';
import { validateCronSchedule } from '../../util/cron';

export { validateCronSchedule };

interface CronEntry {
  path: string;
  schedule: string;
}

export default async function add(client: Client, argv: string[]) {
  const telemetry = new CronsAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(addSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { flags } = parsedArgs;

  let cronPath: string | undefined = flags['--path'];
  let schedule: string | undefined = flags['--schedule'];

  telemetry.trackCliOptionPath(cronPath);
  telemetry.trackCliOptionSchedule(schedule);

  // If flags not provided, prompt interactively
  if (!cronPath || !schedule) {
    if (!client.stdin.isTTY) {
      output.error(
        `Missing required flags. Use ${getCommandName('crons add --path /api/cron --schedule "0 10 * * *"')} in non-interactive mode.`
      );
      return 1;
    }

    if (!cronPath) {
      cronPath = await client.input.text({
        message: 'What is the API route path for the cron job?',
        validate: (value: string) => {
          if (!value.startsWith('/')) {
            return 'Path must start with /';
          }
          if (value.length > 512) {
            return 'Path must be 512 characters or less';
          }
          return true;
        },
      });
    }

    if (!schedule) {
      schedule = await client.input.text({
        message: 'What is the cron schedule expression?',
        validate: validateCronSchedule,
      });
    }
  }

  // Validate inputs
  if (!cronPath.startsWith('/')) {
    output.error('Path must start with /');
    return 1;
  }
  if (cronPath.length > 512) {
    output.error('Path must be 512 characters or less');
    return 1;
  }
  const scheduleValidation = validateCronSchedule(schedule);
  if (scheduleValidation !== true) {
    output.error(scheduleValidation);
    return 1;
  }

  // Check for non-JSON config files (vercel.ts, vercel.mjs, vercel.toml, etc.)
  const nonJsonConfigs = [
    ...VERCEL_CONFIG_EXTENSIONS.map(ext => `vercel.${ext}`),
    ...(isVercelTomlEnabled() ? ['vercel.toml'] : []),
  ];
  for (const configName of nonJsonConfigs) {
    const altPath = resolve(client.cwd, configName);
    try {
      await access(altPath);
      output.error(
        `Found ${chalk.cyan(configName)} — ${getCommandName('crons add')} only supports ${chalk.cyan('vercel.json')}. Add cron jobs directly to your ${chalk.cyan(configName)} file instead.`
      );
      return 1;
    } catch {
      // File doesn't exist, continue
    }
  }

  // Read existing vercel.json or create one
  const configPath = resolve(client.cwd, 'vercel.json');
  let config: Record<string, unknown>;

  try {
    const content = await readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {
      output.error(
        `Failed to parse ${chalk.cyan('vercel.json')}: ${err.message}`
      );
      return 1;
    }
    if (
      err instanceof Error &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      config = {};
    } else {
      output.error(
        `Failed to read ${chalk.cyan('vercel.json')}: ${err instanceof Error ? err.message : String(err)}`
      );
      return 1;
    }
  }

  // Get existing crons or create empty array
  const existingCrons: CronEntry[] = Array.isArray(config.crons)
    ? config.crons
    : [];

  // Check for duplicate path
  if (existingCrons.some(c => c.path === cronPath)) {
    output.error(
      `A cron job with path ${chalk.bold(cronPath)} already exists in vercel.json`
    );
    return 1;
  }

  // Add the new cron
  existingCrons.push({ path: cronPath, schedule });
  config.crons = existingCrons;

  // Write back to vercel.json
  try {
    await writeFile(
      configPath,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8'
    );
  } catch (err: unknown) {
    output.error(
      `Failed to write ${chalk.cyan('vercel.json')}: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }

  output.log(
    `Added cron job ${chalk.bold(cronPath)} with schedule ${chalk.bold(schedule)} to ${chalk.cyan('vercel.json')}`
  );
  output.warn(
    `This cron job won't be active until the project is deployed to production. Run ${getCommandName('deploy --prod')} to deploy.`
  );

  return 0;
}
