import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { validateJsonOutput } from '../../util/output-format';
import { printError } from '../../util/error';
import { sanitizeForTerminal } from '../../util/connex/sanitize';
import { selectConnexTeam } from '../../util/connex/select-team';
import table from '../../util/output/table';
import { packageName } from '../../util/pkg-name';
import type { ConnexNetwork } from './types';
import { serializeNetwork } from './networks-shared';

export async function networksList(
  client: Client,
  flags: {
    '--search'?: string;
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
  const searchQuery = flags['--search'];

  await selectConnexTeam(
    client,
    'Select the team whose networks you want to list'
  );

  const params = new URLSearchParams();
  if (searchQuery) {
    params.set('search', searchQuery);
  }
  const query = params.toString();
  const url = `/v1/connect/networks${query ? `?${query}` : ''}`;

  output.spinner('Fetching networks…');
  let networks: ConnexNetwork[];
  try {
    networks = await client.fetch<ConnexNetwork[]>(url);
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

  networks = networks ?? [];

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ networks: networks.map(serializeNetwork) }, null, 2)}\n`
    );
    return 0;
  }

  if (networks.length === 0) {
    output.log(
      `No networks found. Create one with \`${packageName} connect networks create\`.`
    );
    return 0;
  }

  const headers = ['ID', 'Name', 'Region', 'CIDR', 'Status'];
  const rows = networks.map(n => [
    n.id,
    sanitizeForTerminal(n.name || '') || chalk.gray('–'),
    n.region ?? chalk.gray('–'),
    n.cidr,
    n.status,
  ]);

  output.print(
    `${table([headers.map(h => chalk.bold(chalk.cyan(h))), ...rows], {
      hsep: 4,
    })}\n`
  );

  return 0;
}
