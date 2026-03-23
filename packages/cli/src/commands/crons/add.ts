import chalk from 'chalk';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { getLinkedProject } from '../../util/projects/link';
import output from '../../output-manager';
import { CronsAddTelemetryClient } from '../../util/telemetry/commands/crons/add';
import { addSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import type { CronDefinitionsResponse } from './types';

const CRON_FIELD_RANGES: [string, number, number][] = [
  ['minute', 0, 59],
  ['hour', 0, 23],
  ['day of month', 1, 31],
  ['month', 1, 12],
  ['day of week', 0, 7],
];

export function validateCronSchedule(expression: string): string | true {
  if (expression.length > 256) {
    return 'Schedule expression must be 256 characters or less';
  }

  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return `Schedule must have exactly 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}`;
  }

  for (let i = 0; i < fields.length; i++) {
    const [name, min, max] = CRON_FIELD_RANGES[i];
    const error = validateCronField(fields[i], name, min, max);
    if (error) {
      return error;
    }
  }

  return true;
}

function validateCronField(
  field: string,
  name: string,
  min: number,
  max: number
): string | null {
  // Handle lists (e.g. "1,15,30")
  const parts = field.split(',');
  for (const part of parts) {
    // Handle step values (e.g. "*/5" or "1-30/2")
    const [range, stepStr] = part.split('/');

    if (stepStr !== undefined) {
      const step = Number(stepStr);
      if (!Number.isInteger(step) || step < 1) {
        return `Invalid step value "${stepStr}" in ${name} field`;
      }
    }

    if (range === '*') {
      continue;
    }

    // Handle ranges (e.g. "1-5")
    if (range.includes('-')) {
      const rangeParts = range.split('-');
      if (
        rangeParts.length !== 2 ||
        rangeParts[0] === '' ||
        rangeParts[1] === ''
      ) {
        return `Invalid range "${range}" in ${name} field`;
      }
      const [startStr, endStr] = rangeParts;
      const start = Number(startStr);
      const end = Number(endStr);
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        return `Invalid range "${range}" in ${name} field`;
      }
      if (start < min || start > max || end < min || end > max) {
        return `Value out of range in ${name} field (${min}-${max})`;
      }
      if (start > end) {
        return `Invalid range "${range}" in ${name} field: start is greater than end`;
      }
      continue;
    }

    // Single value
    const value = Number(range);
    if (!Number.isInteger(value)) {
      return `Invalid value "${range}" in ${name} field`;
    }
    if (value < min || value > max) {
      return `Value ${value} out of range in ${name} field (${min}-${max})`;
    }
  }

  return null;
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
  const host: string | undefined = flags['--host'];
  const description: string | undefined = flags['--description'];

  telemetry.trackCliOptionPath(cronPath);
  telemetry.trackCliOptionSchedule(schedule);
  telemetry.trackCliOptionDescription(description);

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

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn't linked to a project on Vercel. ${client.nonInteractive ? `Run ${getCommandName('link --yes --team <team-id> --project <project-id>')} to link non-interactively.` : `Run ${getCommandName('link')} to begin.`}`
    );
    return 1;
  }
  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  output.spinner(`Adding cron job ${chalk.bold(cronPath)}`);

  const body: {
    path: string;
    schedule: string;
    host?: string;
    description?: string;
  } = {
    path: cronPath,
    schedule,
  };
  if (host) {
    body.host = host;
  }
  if (description) {
    body.description = description;
  }

  try {
    await client.fetch<CronDefinitionsResponse>(
      `/v1/projects/${encodeURIComponent(project.id)}/crons/definitions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
  } catch (err: unknown) {
    if (isAPIError(err)) {
      output.error(
        `Failed to add cron job ${chalk.bold(cronPath)}: ${err.message}`
      );
      return 1;
    }
    throw err;
  }

  output.log(
    `Added cron job ${chalk.bold(cronPath)} with schedule ${chalk.bold(schedule)}`
  );

  return 0;
}
