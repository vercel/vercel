import chalk from 'chalk';
import ms from 'ms';
import type Client from '../../util/client';
import { requireProjectContext } from '../../util/projects/require-project-context';
import output from '../../output-manager';
import { listVersionsSubcommand } from './command';
import { parseSubcommandArgs, withGlobalFlags } from './shared';
import { outputAgentError } from '../../util/agent-output';
import {
  getRenamedOption,
  reportRenamedOptionError,
  withWarnings,
} from '../../util/renamed-option';
import getRouteVersions from '../../util/routes/get-route-versions';
import stamp from '../../util/output/stamp';
import formatTable from '../../util/format-table';
import type { RouteVersion } from '../../util/routes/types';

export default async function listVersions(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(
    argv,
    listVersionsSubcommand,
    client
  );
  if (typeof parsed === 'number') return parsed;

  const asJson = Boolean(parsed.flags['--json']);
  const limit = getRenamedOption<number>(parsed.flags, '--limit', '--count', {
    json: asJson,
  });
  if ('error' in limit) {
    return reportRenamedOptionError(client, limit.error, { json: asJson });
  }

  const link = await requireProjectContext(
    client,
    'routes',
    parsed.flags['--project']
  );
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;
  const count = limit.value;

  // Validate count
  if (count !== undefined) {
    if (count < 1 || count > 100) {
      if (client.nonInteractive) {
        outputAgentError(client, {
          status: 'error',
          reason: 'invalid_arguments',
          message: 'Count must be between 1 and 100',
          next: [
            {
              command: withGlobalFlags(
                client,
                'routes list-versions --limit 20'
              ),
            },
          ],
        });
        process.exit(1);
      }
      output.error('Count must be between 1 and 100');
      return 2;
    }
  }

  const lsStamp = stamp();
  if (!asJson) {
    output.spinner(`Fetching route versions for ${chalk.bold(project.name)}`);
  }

  const { versions } = await getRouteVersions(client, project.id, {
    teamId,
    count,
  });

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(withWarnings({ versions }, [limit.warning]), null, 2)}\n`
    );
    return 0;
  }

  output.log(
    `Route versions for ${chalk.bold(project.name)} ${chalk.gray(lsStamp())}`
  );

  if (versions.length === 0) {
    output.log('\n  No versions found\n');
    return 0;
  }

  output.print(formatVersionsTable(versions));
  output.print('\n');

  return 0;
}

function formatVersionsTable(versions: RouteVersion[]): string {
  const rows: string[][] = versions.map(version => {
    let status = '';
    if (version.isStaging) {
      status = chalk.yellow('Staging');
    } else if (version.isLive) {
      status = chalk.green('Live');
    } else {
      status = chalk.gray('Previous');
    }

    const id = version.id.slice(0, 12);
    const routeCount =
      version.ruleCount !== undefined ? version.ruleCount.toString() : '-';
    const age = getRelativeTime(version.lastModified);

    return [status, id, routeCount, age];
  });

  return formatTable(
    ['Status', 'ID', 'Routes', 'Age'],
    ['l', 'l', 'r', 'l'],
    [{ rows }]
  );
}

function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 1000) {
    return 'just now';
  }

  return ms(diff, { long: true }) + ' ago';
}
