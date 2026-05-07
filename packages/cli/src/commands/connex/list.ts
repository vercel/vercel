import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { validateJsonOutput } from '../../util/output-format';
import { printError } from '../../util/error';
import { selectConnexTeam } from '../../util/connex/select-team';
import { getLinkedProject } from '../../util/projects/link';
import table from '../../util/output/table';
import { packageName } from '../../util/pkg-name';

interface ConnexClientProject {
  id: string;
  name: string;
}

interface ConnexClient {
  id: string;
  uid: string;
  name: string;
  type: string;
  typeName?: string;
  createdAt: number;
  projects?: ConnexClientProject[];
}

interface ListClientsResponse {
  clients: ConnexClient[];
  cursor?: string;
}

export async function list(
  client: Client,
  flags: {
    '--all'?: boolean;
    '--limit'?: number;
    '--next'?: string;
    '--format'?: string;
    '--json'?: boolean;
  }
): Promise<number> {
  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;
  const all = flags['--all'] === true;

  let projectId: string | undefined;
  let projectName: string | undefined;

  if (all) {
    await selectConnexTeam(
      client,
      'Select the team whose Connex clients you want to list'
    );
  } else {
    const linked = await getLinkedProject(client);
    if (linked.status === 'error') {
      return linked.exitCode;
    }
    if (linked.status === 'not_linked') {
      output.error(
        `No project linked. Either use \`${packageName} link\` to link a project, or the \`--all\` flag to list all clients.`
      );
      return 1;
    }
    if (linked.org.type === 'team') {
      client.config.currentTeam = linked.org.id;
    } else {
      client.config.currentTeam = undefined;
    }
    projectId = linked.project.id;
    projectName = linked.project.name;
  }

  const params = new URLSearchParams();
  if (flags['--limit'] !== undefined) {
    params.set('limit', String(flags['--limit']));
  }
  if (flags['--next']) {
    params.set('cursor', flags['--next']);
  }
  if (all) {
    params.set('include', 'projects');
  } else if (projectId) {
    params.set('projectId', projectId);
  }
  const query = params.toString();
  const url = `/v1/connex/clients${query ? `?${query}` : ''}`;

  output.spinner('Fetching Connex clients…');
  let response: ListClientsResponse;
  try {
    response = await client.fetch<ListClientsResponse>(url);
  } catch (err: unknown) {
    output.stopSpinner();
    const status = (err as { status?: number }).status;
    if (status === 404) {
      output.error(
        'Connex is not enabled for this team. Contact support to enable it.'
      );
      return 1;
    }
    printError(err);
    return 1;
  }
  output.stopSpinner();

  const clients = response.clients ?? [];

  if (asJson) {
    const jsonClients = clients.map(c => {
      const item: {
        uid: string;
        id: string;
        name: string;
        type: string;
        typeName?: string;
        createdAt: number;
        projects?: ConnexClientProject[];
      } = {
        uid: c.uid,
        id: c.id,
        name: c.name,
        type: c.type,
        typeName: c.typeName,
        createdAt: c.createdAt,
      };
      if (all) {
        item.projects = c.projects ?? [];
      }
      return item;
    });
    client.stdout.write(
      `${JSON.stringify({ clients: jsonClients, cursor: response.cursor }, null, 2)}\n`
    );
    return 0;
  }

  if (clients.length === 0) {
    if (all) {
      output.log(
        `No Connex clients found. Create one with \`${packageName} connex create <type>\`.`
      );
    } else {
      output.log(
        `No Connex clients linked to ${chalk.bold(projectName ?? 'this project')}. Run \`${packageName} connex list --all\` to see every client in the team.`
      );
    }
    return 0;
  }

  if (!all && projectName) {
    output.log(`Connex clients linked to ${chalk.bold(projectName)}:`);
  }

  const headers = ['UID', 'ID', 'Name', 'Type'];
  if (all) {
    headers.push('Projects');
  }
  const rows = clients.map(c => {
    const row = [
      c.uid || chalk.gray('–'),
      c.id,
      c.name || chalk.gray('–'),
      c.typeName || c.type,
    ];
    if (all) {
      const names = (c.projects ?? []).map(p => p.name).filter(Boolean);
      row.push(names.length ? names.join(', ') : chalk.gray('–'));
    }
    return row;
  });

  output.print(
    `${table([headers.map(h => chalk.bold(chalk.cyan(h))), ...rows], {
      hsep: 4,
    })}\n`
  );

  if (response.cursor) {
    const nextCommand = all
      ? `${packageName} connex list --all --next ${response.cursor}`
      : `${packageName} connex list --next ${response.cursor}`;
    output.log(`To see more, run \`${nextCommand}\``);
  }

  return 0;
}
