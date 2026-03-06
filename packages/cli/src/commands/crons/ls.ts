import chalk from 'chalk';
import type Client from '../../util/client';
import formatTable from '../../util/format-table';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import { getLinkedProject } from '../../util/projects/link';
import { validateJsonOutput } from '../../util/output-format';
import output from '../../output-manager';
import { CronsLsTelemetryClient } from '../../util/telemetry/commands/crons/ls';
import { listSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateLsArgs } from '../../util/validate-ls-args';
import type { CronJobDefinition } from './types';

export default async function ls(client: Client, argv: string[]) {
  const telemetry = new CronsLsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args, flags: opts } = parsedArgs;

  const validationResult = validateLsArgs({
    commandName: 'crons ls',
    args: args,
    maxArgs: 0,
    exitCode: 2,
  });
  if (validationResult !== 0) {
    return validationResult;
  }

  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

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

  const lsStamp = stamp();

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
  const isDisabled = projectData.crons?.disabledAt != null;

  if (asJson) {
    output.stopSpinner();
    const jsonOutput = {
      crons: definitions.map(cron => ({
        path: cron.path,
        schedule: cron.schedule,
        host: cron.host,
      })),
      enabled: !isDisabled,
    };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else if (definitions.length === 0) {
    output.log(
      `No cron jobs found for ${chalk.bold(`${org.slug}/${project.name}`)} ${chalk.gray(lsStamp())}`
    );
  } else {
    output.log(
      `${definitions.length} cron ${definitions.length === 1 ? 'job' : 'jobs'} found for ${chalk.bold(`${org.slug}/${project.name}`)}${isDisabled ? chalk.yellow(' (disabled)') : ''} ${chalk.gray(lsStamp())}`
    );
    output.print(
      formatCronsTable(definitions).replace(/^(.*)/gm, `${' '.repeat(1)}$1`)
    );
    output.print('\n\n');
  }

  return 0;
}

function formatCronsTable(definitions: CronJobDefinition[]) {
  const rows: string[][] = definitions.map(cron => [
    chalk.bold(cron.path),
    cron.schedule,
  ]);

  return formatTable(['Path', 'Schedule'], ['l', 'l'], [{ rows }]);
}
