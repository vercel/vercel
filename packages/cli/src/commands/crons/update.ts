import chalk from 'chalk';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { getLinkedProject } from '../../util/projects/link';
import output from '../../output-manager';
import { CronsUpdateTelemetryClient } from '../../util/telemetry/commands/crons/update';
import { updateSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { validateCronSchedule } from './add';
import type { CronDefinitionsResponse } from './types';

export default async function update(client: Client, argv: string[]) {
  const telemetry = new CronsUpdateTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(updateSubcommand.options);
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

  telemetry.trackCliOptionPath(cronPath);
  telemetry.trackCliOptionSchedule(schedule);

  if (!cronPath) {
    if (!client.stdin.isTTY) {
      output.error(
        `Missing required flag --path. Use ${getCommandName('crons update --path /api/cron --schedule "0 10 * * *"')} in non-interactive mode.`
      );
      return 1;
    }

    cronPath = await client.input.text({
      message: 'What is the path of the cron job to update?',
      validate: (value: string) => {
        if (!value.startsWith('/')) {
          return 'Path must start with /';
        }
        return true;
      },
    });
  }

  if (!schedule && !host) {
    if (!client.stdin.isTTY) {
      output.error(`At least one of --schedule or --host must be provided.`);
      return 1;
    }

    schedule = await client.input.text({
      message: 'What is the new cron schedule expression?',
      validate: validateCronSchedule,
    });
  }

  // Validate inputs
  if (!cronPath.startsWith('/')) {
    output.error('Path must start with /');
    return 1;
  }

  if (schedule) {
    const scheduleValidation = validateCronSchedule(schedule);
    if (scheduleValidation !== true) {
      output.error(scheduleValidation);
      return 1;
    }
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

  output.spinner(`Updating cron job ${chalk.bold(cronPath)}`);

  const body: { path: string; schedule?: string; host?: string } = {
    path: cronPath,
  };
  if (schedule) {
    body.schedule = schedule;
  }
  if (host) {
    body.host = host;
  }

  try {
    await client.fetch<CronDefinitionsResponse>(
      `/v1/projects/${encodeURIComponent(project.id)}/crons/definitions`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
  } catch (err: unknown) {
    if (isAPIError(err)) {
      output.error(
        `Failed to update cron job ${chalk.bold(cronPath)}: ${err.message}`
      );
      return 1;
    }
    throw err;
  }

  const parts: string[] = [];
  if (schedule) {
    parts.push(`schedule ${chalk.bold(schedule)}`);
  }
  if (host) {
    parts.push(`host ${chalk.bold(host)}`);
  }

  output.log(
    `Updated cron job ${chalk.bold(cronPath)} with ${parts.join(' and ')}`
  );

  return 0;
}
