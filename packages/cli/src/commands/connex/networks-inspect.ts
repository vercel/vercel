import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { validateJsonOutput } from '../../util/output-format';
import { selectConnexTeam } from '../../util/connex/select-team';
import type { ConnexNetwork } from './types';
import { printNetworkDetails, serializeNetwork } from './networks-shared';

export async function networksInspect(
  client: Client,
  args: string[],
  flags: {
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

  const networkId = args[0];
  if (!networkId) {
    output.error(
      'Missing network ID. Usage: vercel connect networks inspect <id>'
    );
    return 1;
  }

  await selectConnexTeam(client, 'Select the team for this network');

  output.spinner('Fetching network…');
  let network: ConnexNetwork;
  try {
    network = await client.fetch<ConnexNetwork>(
      `/v1/connect/networks/${encodeURIComponent(networkId)}`
    );
  } catch (err: unknown) {
    output.stopSpinner();
    const status = (err as { status?: number }).status;
    if (status === 404) {
      output.error(`No network found for ${chalk.bold(networkId)}.`);
      return 1;
    }
    output.error(
      `Failed to look up ${chalk.bold(networkId)}: ${(err as Error).message}`
    );
    return 1;
  }
  output.stopSpinner();

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(serializeNetwork(network), null, 2)}\n`
    );
    return 0;
  }

  printNetworkDetails(network);
  return 0;
}
