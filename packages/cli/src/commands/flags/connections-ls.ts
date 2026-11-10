import chalk from 'chalk';
import ms from 'ms';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { getConnections } from '../../util/flags/connections';
import { quoteArg } from '../../util/flags/quote-arg';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import formatTable from '../../util/format-table';
import output from '../../output-manager';
import { FlagsConnectionsLsTelemetryClient } from '../../util/telemetry/commands/flags/connections';
import { connectionsListSubcommand } from './command';
import type {
  FlagsProjectConnection,
  FlagsProjectConnectionRole,
} from '../../util/flags/types';
import { formatProject } from '../../util/projects/format-project';
import { getProjectNameFromFlags } from './project';
import {
  connectionsCommand,
  connectionsError,
  resolveSourceProject,
} from './connections-common';

const VALID_ROLES: FlagsProjectConnectionRole[] = ['source', 'consumer'];

export default async function connectionsLs(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsConnectionsLsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    connectionsListSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 2;
  }

  const { flags } = parsedArgs;
  const json = flags['--json'] as boolean | undefined;
  const role = (flags['--role'] as string | undefined) ?? 'source';
  const projectName = getProjectNameFromFlags(flags);

  telemetryClient.trackCliOptionProject(projectName);
  telemetryClient.trackCliOptionRole(flags['--role'] as string | undefined);
  telemetryClient.trackCliFlagJson(json);

  if (!isRole(role)) {
    return connectionsError(
      client,
      {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`,
        next: [
          {
            command: 'flags connections ls --role <source|consumer>',
            when: 'list connections for a valid role',
          },
        ],
      },
      2
    );
  }

  const link = await resolveSourceProject(client, projectName);
  if (typeof link === 'number') {
    return link;
  }

  const { project, org } = link;
  const projectSlugLink = formatProject(org.slug, project.name);
  const accountId = org.type === 'team' ? org.id : undefined;

  try {
    output.spinner('Fetching flags connections...');
    const connections = await getConnections(client, project.id, role);
    const sorted = connections.sort((a, b) => b.createdAt - a.createdAt);
    const names = json
      ? new Map<string, string>()
      : await resolveProjectNames(client, sorted, role, accountId);
    output.stopSpinner();

    if (json) {
      client.stdout.write(
        `${JSON.stringify({ role, connections: sorted }, null, 2)}\n`
      );
    } else if (sorted.length === 0) {
      if (role === 'source') {
        output.log(`No project may read the flags of ${projectSlugLink}`);
        output.log(
          `\nConnect one with: ${chalk.cyan(connectionsCommand(client, 'flags connections add <consumer-project>'))}`
        );
      } else {
        output.log(`${projectSlugLink} may not read the flags of any project`);
        output.log(
          `\nAsk an owner of the source project to run: ${getCommandName(`flags connections add ${quoteArg(project.name)} --project <source-project>`)}`
        );
      }
    } else {
      const count = `${chalk.bold(sorted.length)} project${sorted.length === 1 ? '' : 's'}`;
      output.log(
        role === 'source'
          ? `${count} may read the flags of ${projectSlugLink}`
          : `${projectSlugLink} may read the flags of ${count}`
      );
      printConnectionsTable(sorted, role, names);
    }
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}

function isRole(value: string): value is FlagsProjectConnectionRole {
  return (VALID_ROLES as string[]).includes(value);
}

function otherProjectId(
  connection: FlagsProjectConnection,
  role: FlagsProjectConnectionRole
): string {
  return role === 'source'
    ? connection.consumerProjectId
    : connection.sourceProjectId;
}

// Lists are small and same-team; a failed lookup falls back to the ID.
async function resolveProjectNames(
  client: Client,
  connections: FlagsProjectConnection[],
  role: FlagsProjectConnectionRole,
  accountId: string | undefined
): Promise<Map<string, string>> {
  const ids = [...new Set(connections.map(c => otherProjectId(c, role)))];
  const entries = await Promise.all(
    ids.map(async (id): Promise<[string, string]> => {
      try {
        const project = await getProjectByNameOrId(client, id, accountId);
        return [id, project instanceof Error ? id : project.name];
      } catch {
        return [id, id];
      }
    })
  );
  return new Map(entries);
}

function printConnectionsTable(
  connections: FlagsProjectConnection[],
  role: FlagsProjectConnectionRole,
  names: Map<string, string>
) {
  const now = Date.now();
  const header = role === 'source' ? 'Consumer Project' : 'Source Project';

  const rows = connections.map(connection => {
    const id = otherProjectId(connection, role);
    const name = names.get(id) ?? id;
    return [
      name === id ? id : `${name} ${chalk.dim(id)}`,
      chalk.dim(connection.createdBy),
      ms(now - connection.createdAt) + ' ago',
    ];
  });

  const table = formatTable(
    [header, 'Created By', 'Created'],
    ['l', 'l', 'l'],
    [{ name: '', rows }]
  );
  output.print(`\n${table}\n`);
}
