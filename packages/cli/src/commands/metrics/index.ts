import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { type Command, help } from '../help';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { MetricsTelemetryClient } from '../../util/telemetry/commands/metrics';
import { getLinkedProject } from '../../util/projects/link';
import getProjectByIdOrName from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import getSubcommand from '../../util/get-subcommand';
import { getCommandAliases } from '..';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { metricsCommand, querySubcommand, schemaSubcommand } from './command';
import type { MetricsOptions } from './types';
import schemaHandler from './schema';
import queryHandler from './query';

const COMMAND_CONFIG = {
  query: getCommandAliases(querySubcommand),
  schema: getCommandAliases(schemaSubcommand),
};

export default async function metrics(client: Client): Promise<number> {
  const telemetry = new MetricsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const {
    subcommand,
    args: subcommandArgs,
    subcommandOriginal,
  } = getSubcommand(client.argv.slice(3), COMMAND_CONFIG);

  const needHelp = client.argv.includes('--help') || client.argv.includes('-h');

  // If no subcommand and --help, show main help
  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('metrics');
    output.print(help(metricsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printSubcommandHelp(command: Command) {
    output.print(
      help(command, {
        parent: metricsCommand,
        columns: client.stderr.columns,
      })
    );
  }

  try {
    switch (subcommand) {
      case 'schema': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('metrics', subcommandOriginal);
          printSubcommandHelp(schemaSubcommand);
          return 2;
        }

        const schemaFlags = parseArguments(
          subcommandArgs,
          getFlagsSpecification(schemaSubcommand.options)
        );

        telemetry.trackCliSubcommandSchema(subcommandOriginal!);
        telemetry.trackCliOptionEvent(schemaFlags.flags['--event']);
        telemetry.trackCliFlagJson(schemaFlags.flags['--json']);

        return await schemaHandler(client, schemaFlags.flags);
      }

      case 'query':
      default: {
        // 'query' is the default subcommand
        if (needHelp) {
          telemetry.trackCliFlagHelp('metrics', subcommandOriginal ?? 'query');
          printSubcommandHelp(querySubcommand);
          return 2;
        }

        // Parse query flags - if we came through default (no explicit subcommand),
        // we need to use the full args minus 'metrics'
        const queryArgs =
          subcommand === 'query' ? subcommandArgs : client.argv.slice(3);
        const queryFlags = parseArguments(
          queryArgs,
          getFlagsSpecification(querySubcommand.options)
        );

        // Track telemetry
        if (subcommand === 'query') {
          telemetry.trackCliSubcommandQuery(subcommandOriginal!);
        }
        telemetry.trackCliOptionEvent(queryFlags.flags['--event']);
        telemetry.trackCliOptionMeasure(queryFlags.flags['--measure']);
        telemetry.trackCliOptionAggregation(queryFlags.flags['--aggregation']);
        telemetry.trackCliOptionBy(queryFlags.flags['--by']);
        telemetry.trackCliOptionLimit(queryFlags.flags['--limit']);
        telemetry.trackCliOptionStatus(queryFlags.flags['--status']);
        telemetry.trackCliOptionError(queryFlags.flags['--error']);
        telemetry.trackCliOptionPath(queryFlags.flags['--path']);
        telemetry.trackCliOptionMethod(queryFlags.flags['--method']);
        telemetry.trackCliOptionRegion(queryFlags.flags['--region']);
        telemetry.trackCliOptionFilter(queryFlags.flags['--filter']);
        telemetry.trackCliOptionSince(queryFlags.flags['--since']);
        telemetry.trackCliOptionUntil(queryFlags.flags['--until']);
        telemetry.trackCliOptionGranularity(queryFlags.flags['--granularity']);
        telemetry.trackCliOptionProject(queryFlags.flags['--project']);
        telemetry.trackCliOptionEnvironment(queryFlags.flags['--environment']);
        telemetry.trackCliOptionDeployment(queryFlags.flags['--deployment']);
        telemetry.trackCliFlagJson(queryFlags.flags['--json']);
        telemetry.trackCliFlagSummary(queryFlags.flags['--summary']);

        // Validate required --event flag
        const eventOption = queryFlags.flags['--event'];
        if (!eventOption) {
          output.error(
            `Missing required flag ${chalk.bold('--event')}. Specify the event type to query.`
          );
          output.print('\n');
          output.print(
            chalk.dim(
              `Run ${chalk.cyan('vercel metrics schema')} to see available events.\n`
            )
          );
          return 1;
        }

        // Resolve project scope
        const projectOption = queryFlags.flags['--project'];
        let teamSlug: string;
        let projectName: string;

        if (projectOption) {
          // Use specified project
          output.spinner(`Fetching project "${projectOption}"`, 1000);
          const project = await getProjectByIdOrName(
            client,
            projectOption,
            client.config.currentTeam
          );
          output.stopSpinner();

          if (project instanceof ProjectNotFound) {
            output.error(`Project not found: ${projectOption}`);
            return 1;
          }

          projectName = project.name;
          // Need to get team slug from context
          const { contextName } = await import('../../util/get-scope').then(m =>
            m.default(client)
          );
          teamSlug = contextName ?? '';
        } else {
          // Use linked project
          const link = await getLinkedProject(client);
          if (link.status === 'error') {
            return link.exitCode;
          }
          if (link.status === 'not_linked') {
            output.error(
              `Your codebase isn't linked to a project on Vercel. Run ${chalk.cyan(
                'vercel link'
              )} to begin, or specify a project with ${chalk.bold('--project')}.`
            );
            return 1;
          }

          projectName = link.project.name;
          teamSlug = link.org.slug;
          client.config.currentTeam =
            link.org.type === 'team' ? link.org.id : undefined;
        }

        // Build options
        const options: MetricsOptions = {
          event: eventOption,
          measure: queryFlags.flags['--measure'] ?? 'count',
          aggregation: queryFlags.flags['--aggregation'] ?? 'sum',
          by: queryFlags.flags['--by'] ?? [],
          limit: queryFlags.flags['--limit'] ?? 100,
          status: queryFlags.flags['--status'],
          error: queryFlags.flags['--error'],
          path: queryFlags.flags['--path'],
          method: queryFlags.flags['--method'],
          region: queryFlags.flags['--region'],
          filter: queryFlags.flags['--filter'],
          since: queryFlags.flags['--since'],
          until: queryFlags.flags['--until'],
          granularity: queryFlags.flags['--granularity'],
          project: projectOption,
          environment: queryFlags.flags['--environment'],
          deployment: queryFlags.flags['--deployment'],
          json: queryFlags.flags['--json'] ?? false,
          summary: queryFlags.flags['--summary'] ?? false,
        };

        return await queryHandler(client, teamSlug, projectName, options);
      }
    }
  } catch (err: unknown) {
    // Handle invalid subcommand
    if (subcommand && !['query', 'schema'].includes(subcommand)) {
      output.debug(`Invalid subcommand: ${subcommand}`);
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(metricsCommand, { columns: client.stderr.columns }));
      return 2;
    }

    printError(err);
    return 1;
  }
}
