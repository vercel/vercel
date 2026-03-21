import chalk from 'chalk';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { getLinkedProject } from '../../util/projects/link';
import output from '../../output-manager';
import { CronsRmTelemetryClient } from '../../util/telemetry/commands/crons/rm';
import { rmSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import type { CronDefinitionsResponse, CronJobDefinition } from './types';

export default async function rm(client: Client, argv: string[]) {
  const telemetry = new CronsRmTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(rmSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags } = parsedArgs;

  let [cronPath] = args;
  const yes = flags['--yes'];

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

  if (!cronPath) {
    if (!client.stdin.isTTY) {
      output.error(
        `A cron path argument is required in non-interactive mode. Usage: ${getCommandName('crons rm <path>')}`
      );
      return 1;
    }

    // Fetch crons to let user select
    output.spinner(
      `Fetching cron jobs for ${chalk.bold(`${org.slug}/${project.name}`)}`
    );

    const projectData = await client.fetch<{
      crons?: {
        definitions: CronJobDefinition[];
      };
    }>(`/v9/projects/${encodeURIComponent(project.id)}`);

    const definitions = (projectData.crons?.definitions ?? []).filter(
      d => d.source === 'api'
    );

    if (definitions.length === 0) {
      output.error(
        `No API-managed cron jobs found for ${chalk.bold(`${org.slug}/${project.name}`)}.`
      );
      return 1;
    }

    output.stopSpinner();

    if (definitions.length === 1) {
      cronPath = definitions[0].path;
      output.log(`Auto-selected ${chalk.bold(cronPath)} (only cron job)`);
    } else {
      cronPath = await client.input.select({
        message: 'Which cron job would you like to remove?',
        choices: definitions.map(cron => ({
          name: `${cron.path} (${cron.schedule})`,
          value: cron.path,
        })),
      });
    }
  }

  // Confirm deletion
  if (!yes) {
    if (!client.stdin.isTTY) {
      output.error(
        `Confirmation required. Use --yes to skip confirmation in non-interactive mode.`
      );
      return 1;
    }

    const confirmed = await client.input.confirm(
      `Remove cron job ${chalk.bold(cronPath)}?`,
      false
    );
    if (!confirmed) {
      output.log('Aborted.');
      return 0;
    }
  }

  output.spinner(`Removing cron job ${chalk.bold(cronPath)}`);

  try {
    await client.fetch<CronDefinitionsResponse>(
      `/v1/projects/${encodeURIComponent(project.id)}/crons/definitions`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: cronPath }),
      }
    );
  } catch (err: unknown) {
    if (isAPIError(err)) {
      output.error(
        `Failed to remove cron job ${chalk.bold(cronPath)}: ${err.message}`
      );
      return 1;
    }
    throw err;
  }

  output.log(`Removed cron job ${chalk.bold(cronPath)}`);

  return 0;
}
