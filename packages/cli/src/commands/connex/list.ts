import chalk from 'chalk';
import ms from 'ms';
import output from '../../output-manager';
import type Client from '../../util/client';
import { validateJsonOutput } from '../../util/output-format';
import { printError } from '../../util/error';
import { selectConnexTeam } from '../../util/connex/select-team';
import table from '../../util/output/table';
import { packageName } from '../../util/pkg-name';

interface ConnexClient {
  id: string;
  uid: string;
  name: string;
  type: string;
  typeName?: string;
  createdAt: number;
}

interface ListClientsResponse {
  clients: ConnexClient[];
  cursor?: string;
}

export async function list(
  client: Client,
  flags: {
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

  await selectConnexTeam(
    client,
    'Select the team whose Connex clients you want to list'
  );

  const params = new URLSearchParams();
  if (flags['--limit'] !== undefined) {
    params.set('limit', String(flags['--limit']));
  }
  if (flags['--next']) {
    params.set('cursor', flags['--next']);
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
    const jsonClients = clients.map(c => ({
      uid: c.uid,
      id: c.id,
      name: c.name,
      type: c.type,
      typeName: c.typeName,
      createdAt: c.createdAt,
    }));
    client.stdout.write(
      `${JSON.stringify({ clients: jsonClients, cursor: response.cursor }, null, 2)}\n`
    );
    return 0;
  }

  if (clients.length === 0) {
    output.log(
      `No Connex clients found. Create one with \`${packageName} connex create <type>\`.`
    );
    return 0;
  }

  const now = Date.now();
  const rows = clients.map(c => [
    c.uid || chalk.gray('–'),
    c.id,
    c.name || chalk.gray('–'),
    c.typeName || c.type,
    c.createdAt
      ? chalk.gray(`${ms(Math.max(0, now - c.createdAt))} ago`)
      : chalk.gray('–'),
  ]);

  output.print(
    `${table(
      [
        ['UID', 'ID', 'Name', 'Type', 'Created'].map(h =>
          chalk.bold(chalk.cyan(h))
        ),
        ...rows,
      ],
      { hsep: 4 }
    )}\n`
  );

  if (response.cursor) {
    output.log(
      `To see more, run \`${packageName} connex list --next ${response.cursor}\``
    );
  }

  return 0;
}
