import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { validateJsonOutput } from '../../util/output-format';
import { printError } from '../../util/error';
import { selectConnectTeam } from '../../util/connect/select-team';
import { getLinkedProject } from '../../util/projects/link';
import table from '../../util/output/table';
import { packageName } from '../../util/pkg-name';

interface LinkedProject {
  id: string;
  name: string;
}

interface ConnectClientProjectLink {
  projectId: string;
  project?: LinkedProject;
}

interface ConnectClient {
  id: string;
  uid: string;
  name: string;
  type: string;
  typeName?: string;
  createdAt: number;
  includes?: {
    projects?: {
      items: ConnectClientProjectLink[];
      hasMore: boolean;
      cursor?: string | null;
    };
  };
}

interface ListClientsResponse {
  clients: ConnectClient[];
  cursor?: string;
}

export async function list(
  client: Client,
  flags: {
    '--all-projects'?: boolean;
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
  const allProjects = flags['--all-projects'] === true;

  let projectId: string | undefined;
  let projectName: string | undefined;

  if (!allProjects) {
    const linked = await getLinkedProject(client);
    if (linked.status === 'error') {
      return linked.exitCode;
    }
    if (linked.status === 'linked') {
      if (linked.org.type === 'team') {
        client.config.currentTeam = linked.org.id;
      } else {
        client.config.currentTeam = undefined;
      }
      projectId = linked.project.id;
      projectName = linked.project.name;
    }
    // status === 'not_linked' → fall through to unscoped mode
  }

  // Unscoped mode: no project link in scope, or `--all-projects` was passed.
  // Resolve a team explicitly so we have one for the API call.
  const unscoped = !projectId;
  if (unscoped) {
    await selectConnectTeam(
      client,
      'Select the team whose Connect connectors you want to list'
    );
  }

  const params = new URLSearchParams();
  if (flags['--limit'] !== undefined) {
    params.set('limit', String(flags['--limit']));
  }
  if (flags['--next']) {
    params.set('cursor', flags['--next']);
  }
  if (unscoped) {
    params.set('include', 'projects');
  } else if (projectId) {
    params.set('projectId', projectId);
  }
  const query = params.toString();
  const url = `/v1/connect/clients${query ? `?${query}` : ''}`;

  output.spinner('Fetching Connect connectors…');
  let response: ListClientsResponse;
  try {
    response = await client.fetch<ListClientsResponse>(url);
  } catch (err: unknown) {
    output.stopSpinner();
    const status = (err as { status?: number }).status;
    if (status === 404) {
      output.error(
        'Connect is not enabled for this team. Contact support to enable it.'
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
        projects?: LinkedProject[];
        hasMoreProjects?: boolean;
      } = {
        uid: c.uid,
        id: c.id,
        name: c.name,
        type: c.type,
        typeName: c.typeName,
        createdAt: c.createdAt,
      };
      if (unscoped) {
        const projectsInclude = c.includes?.projects;
        item.projects = (projectsInclude?.items ?? [])
          .map(p => p.project)
          .filter((p): p is LinkedProject => Boolean(p));
        item.hasMoreProjects = projectsInclude?.hasMore === true;
      }
      return item;
    });
    client.stdout.write(
      `${JSON.stringify({ clients: jsonClients, cursor: response.cursor }, null, 2)}\n`
    );
    return 0;
  }

  if (clients.length === 0) {
    if (unscoped) {
      output.log(
        `No Connect connectors found. Create one with \`${packageName} connect create <type>\`.`
      );
    } else {
      output.log(
        `No Connect connectors linked to ${chalk.bold(projectName ?? 'this project')}. Run \`${packageName} connect list --all-projects\` to see every connector in the team.`
      );
    }
    return 0;
  }

  if (!unscoped && projectName) {
    output.log(`Connect connectors linked to ${chalk.bold(projectName)}:`);
  }

  const headers = ['UID', 'ID', 'Name', 'Type'];
  if (unscoped) {
    headers.push('Projects');
  }
  const rows = clients.map(c => {
    const row = [
      c.uid || chalk.gray('–'),
      c.id,
      c.name || chalk.gray('–'),
      c.typeName || c.type,
    ];
    if (unscoped) {
      const projectsInclude = c.includes?.projects;
      const names = (projectsInclude?.items ?? [])
        .map(p => p.project?.name)
        .filter((n): n is string => Boolean(n));
      const more = projectsInclude?.hasMore === true;
      let cell: string;
      if (names.length === 0 && !more) {
        cell = chalk.gray('–');
      } else {
        const parts: string[] = [];
        if (names.length) parts.push(names.join(', '));
        if (more) parts.push(chalk.gray('+ more'));
        cell = parts.join(' ');
      }
      row.push(cell);
    }
    return row;
  });

  output.print(
    `${table([headers.map(h => chalk.bold(chalk.cyan(h))), ...rows], {
      hsep: 4,
    })}\n`
  );

  if (response.cursor) {
    const nextCommand = allProjects
      ? `${packageName} connect list --all-projects --next ${response.cursor}`
      : `${packageName} connect list --next ${response.cursor}`;
    output.log(`To see more, run \`${nextCommand}\``);
  }

  return 0;
}
