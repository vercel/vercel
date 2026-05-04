import chalk from 'chalk';
import ms from 'ms';
import type Client from '../../util/client';
import {
  nextFireAfter,
  parseCronExpression,
  previousFireBefore,
} from '../../util/cron-times';
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
import { readLocalConfig } from '../../util/config/files';
import type { CronJobDefinition } from './types';

interface LocalCron {
  path: string;
  schedule: string;
}

interface CronTimes {
  next: Date | null;
  previous: Date | null;
}

// Vercel evaluates cron schedules in UTC.
function computeCronTimes(schedule: string, now: Date): CronTimes {
  const fields = parseCronExpression(schedule);
  if (!fields) {
    output.debug(`failed to parse cron schedule "${schedule}"`);
    return { next: null, previous: null };
  }
  return {
    next: nextFireAfter(now, fields),
    previous: previousFireBefore(now, fields),
  };
}

function formatRelative(target: Date | null, now: Date): string {
  if (!target) return chalk.dim('—');
  const delta = target.getTime() - now.getTime();
  if (delta === 0) return 'now';
  if (delta > 0) return `in ${ms(delta)}`;
  return `${ms(-delta)} ago`;
}

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

  // Read local vercel.json to find crons configured but not yet deployed
  const localConfig = readLocalConfig(client.cwd);
  const localCrons: LocalCron[] = Array.isArray(localConfig?.crons)
    ? (localConfig!.crons as LocalCron[])
    : [];
  const deployedByPath = new Map(definitions.map(d => [d.path, d]));
  const undeployedCrons: LocalCron[] = [];
  const modifiedCrons: { local: LocalCron; deployed: CronJobDefinition }[] = [];
  for (const local of localCrons) {
    const deployed = deployedByPath.get(local.path);
    if (!deployed) {
      undeployedCrons.push(local);
    } else if (deployed.schedule !== local.schedule) {
      modifiedCrons.push({ local, deployed });
    }
  }

  const now = new Date();

  if (asJson) {
    output.stopSpinner();
    const jsonOutput = {
      crons: definitions.map(cron => {
        const { next, previous } = computeCronTimes(cron.schedule, now);
        return {
          path: cron.path,
          schedule: cron.schedule,
          host: cron.host,
          nextRun: next ? next.toISOString() : null,
          previousRun: previous ? previous.toISOString() : null,
        };
      }),
      undeployed: undeployedCrons.map(cron => {
        const { next, previous } = computeCronTimes(cron.schedule, now);
        return {
          path: cron.path,
          schedule: cron.schedule,
          nextRun: next ? next.toISOString() : null,
          previousRun: previous ? previous.toISOString() : null,
        };
      }),
      modified: modifiedCrons.map(({ local, deployed }) => ({
        path: local.path,
        localSchedule: local.schedule,
        deployedSchedule: deployed.schedule,
      })),
      enabled: !isDisabled,
    };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
  } else if (
    definitions.length === 0 &&
    undeployedCrons.length === 0 &&
    modifiedCrons.length === 0
  ) {
    output.log(
      `No cron jobs found for ${chalk.bold(`${org.slug}/${project.name}`)} ${chalk.gray(lsStamp())}`
    );
  } else {
    const totalDeployed = definitions.length;
    if (totalDeployed > 0) {
      output.log(
        `${totalDeployed} cron ${totalDeployed === 1 ? 'job' : 'jobs'} found for ${chalk.bold(`${org.slug}/${project.name}`)}${isDisabled ? chalk.yellow(' (disabled)') : ''} ${chalk.gray(lsStamp())}`
      );
      output.print(
        formatCronsTable(definitions, now).replace(
          /^(.*)/gm,
          `${' '.repeat(1)}$1`
        )
      );
      output.print('\n\n');
    }

    if (undeployedCrons.length > 0 || modifiedCrons.length > 0) {
      const pendingCount = undeployedCrons.length + modifiedCrons.length;
      output.log(
        `${pendingCount} local ${pendingCount === 1 ? 'change' : 'changes'} pending deploy`
      );
      output.print(
        formatPendingCronsTable(undeployedCrons, modifiedCrons).replace(
          /^(.*)/gm,
          `${' '.repeat(1)}$1`
        )
      );
      output.print('\n\n');
      output.warn(
        `Run ${getCommandName('deploy --prod')} to apply local changes.`
      );
    }
  }

  return 0;
}

function formatCronsTable(definitions: CronJobDefinition[], now: Date) {
  const rows: string[][] = definitions.map(cron => {
    const { next, previous } = computeCronTimes(cron.schedule, now);
    return [
      chalk.bold(cron.path),
      cron.schedule,
      formatRelative(next, now),
      formatRelative(previous, now),
    ];
  });

  return formatTable(
    ['Path', 'Schedule', 'Next Run', 'Previous Run'],
    ['l', 'l', 'l', 'l'],
    [{ rows }]
  );
}

function formatPendingCronsTable(
  undeployed: LocalCron[],
  modified: { local: LocalCron; deployed: CronJobDefinition }[]
) {
  const rows: string[][] = [
    ...modified.map(({ local, deployed }) => [
      chalk.bold(local.path),
      `${chalk.dim(deployed.schedule)} → ${local.schedule}`,
      chalk.yellow('modified'),
    ]),
    ...undeployed.map(cron => [
      chalk.dim(cron.path),
      chalk.dim(cron.schedule),
      chalk.yellow('not deployed'),
    ]),
  ];

  return formatTable(
    ['Path', 'Schedule', 'Status'],
    ['l', 'l', 'l'],
    [{ rows }]
  );
}
