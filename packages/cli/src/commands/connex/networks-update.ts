import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import type { JSONObject } from '@vercel-internals/types';
import { validateJsonOutput } from '../../util/output-format';
import { selectConnexTeam } from '../../util/connex/select-team';
import { sanitizeForTerminal } from '../../util/connex/sanitize';
import type { ConnexNetwork } from './types';
import { serializeNetwork } from './networks-shared';

export async function networksUpdate(
  client: Client,
  args: string[],
  flags: {
    '--name'?: string;
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
      'Missing network ID. Usage: vercel connect networks update <id>'
    );
    return 1;
  }

  // `name` is the only updatable field, so "at least one flag" reduces to
  // requiring it. Validate locally before any remote mutation.
  const name = flags['--name']?.trim();
  if (name === undefined) {
    output.error('Specify a new name with `--name`.');
    return 1;
  }
  if (name.length === 0) {
    output.error('Network name cannot be empty.');
    return 1;
  }
  if (name.length > 255) {
    output.error('Network name must be 255 characters or fewer.');
    return 1;
  }

  await selectConnexTeam(client, 'Select the team for this network');

  const body: JSONObject = { name };

  output.spinner('Updating network…');
  let network: ConnexNetwork;
  try {
    network = await client.fetch<ConnexNetwork>(
      `/v1/connect/networks/${encodeURIComponent(networkId)}`,
      { method: 'PATCH', body }
    );
  } catch (err: unknown) {
    output.stopSpinner();
    const status = (err as { status?: number }).status;
    if (status === 404) {
      output.error(`No network found for ${chalk.bold(networkId)}.`);
      return 1;
    }
    output.error(
      `Failed to update ${chalk.bold(networkId)}: ${(err as Error).message}`
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

  output.success(
    `Network ${chalk.bold(sanitizeForTerminal(network.name || network.id))} updated.`
  );
  return 0;
}
