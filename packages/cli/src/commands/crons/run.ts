import chalk from 'chalk';
import type Client from '../../util/client';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import { getLinkedProject } from '../../util/projects/link';
import output from '../../output-manager';
import { CronsRunTelemetryClient } from '../../util/telemetry/commands/crons/run';
import { runSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import type { CronJobDefinition } from './types';

export default async function run(client: Client, argv: string[]) {
  const telemetry = new CronsRunTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(runSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args } = parsedArgs;

  let [cronPath] = args;

  telemetry.trackCliArgumentPath(cronPath);

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

  const { project, org } = link;

  const runStamp = stamp();

  output.spinner(
    `Fetching cron jobs for ${chalk.bold(`${org.slug}/${project.name}`)}`
  );

  const projectData = await client.fetch<{
    crons?: {
      definitions: CronJobDefinition[];
      disabledAt: number | null;
      enabledAt: number;
    };
  }>(`/v9/projects/${encodeURIComponent(project.id)}`);

  const definitions = projectData.crons?.definitions ?? [];

  if (definitions.length === 0) {
    output.error(
      `No cron jobs found for ${chalk.bold(`${org.slug}/${project.name}`)}. Define cron jobs in your vercel.json file.`
    );
    return 1;
  }

  if (projectData.crons?.disabledAt != null) {
    output.error(
      `Cron jobs are disabled for ${chalk.bold(`${org.slug}/${project.name}`)}. Enable them in the project settings.`
    );
    return 1;
  }

  // If no path provided, let user select interactively
  if (!cronPath) {
    if (client.nonInteractive) {
      output.error(
        `A cron path argument is required in non-interactive mode. Usage: ${getCommandName('crons run <path>')}`
      );
      return 1;
    }

    if (definitions.length === 1) {
      cronPath = definitions[0].path;
    } else {
      cronPath = await client.input.select({
        message: 'Which cron job would you like to run?',
        choices: definitions.map(cron => ({
          name: `${cron.path} (${cron.schedule})`,
          value: cron.path,
        })),
      });
    }
  }

  // Find the matching cron definition to get the schedule
  const cronDef = definitions.find(d => d.path === cronPath);
  if (!cronDef) {
    output.error(
      `Cron job with path ${chalk.bold(cronPath)} not found. Run ${getCommandName('crons ls')} to see available cron jobs.`
    );
    return 1;
  }

  output.spinner(`Triggering cron job ${chalk.bold(cronPath)}`);

  const teamId = link.org.type === 'team' ? link.org.id : undefined;
  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';

  const result = await client.fetch<{ invocationAt: number }>(
    `/v1/projects/${encodeURIComponent(project.id)}/crons/run${qs}`,
    {
      method: 'POST',
      body: JSON.stringify({
        path: cronDef.path,
        schedule: cronDef.schedule,
      }),
    }
  );

  output.log(
    `Cron job ${chalk.bold(cronPath)} triggered ${chalk.gray(runStamp())}`
  );
  output.log(
    `  Invocation time: ${chalk.cyan(new Date(result.invocationAt).toISOString())}`
  );

  return 0;
}
