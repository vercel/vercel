import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import type { JSONObject } from '@vercel-internals/types';
import { validateJsonOutput } from '../../util/output-format';
import { selectConnexTeam } from '../../util/connex/select-team';
import { sanitizeForTerminal } from '../../util/connex/sanitize';
import { validateNetworkCidr } from '../../util/connex/validate-cidr';
import type { ConnexNetwork } from './types';
import { printNetworkDetails, serializeNetwork } from './networks-shared';

export async function networksCreate(
  client: Client,
  flags: {
    '--name'?: string;
    '--region'?: string;
    '--cidr'?: string;
    '--availability-zone-id'?: string[];
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

  // Validate all local input BEFORE resolving a team or issuing the remote
  // mutation, so a bad CIDR or missing flag never mutates config or calls out.
  const name = flags['--name']?.trim();
  if (!name) {
    output.error('Missing network name. Provide one with `--name`.');
    return 1;
  }
  if (name.length > 255) {
    output.error('Network name must be 255 characters or fewer.');
    return 1;
  }

  const region = flags['--region']?.trim();
  if (!region) {
    output.error('Missing region. Provide one with `--region` (e.g. iad1).');
    return 1;
  }

  const cidr = flags['--cidr']?.trim();
  if (!cidr) {
    output.error(
      'Missing CIDR block. Provide one with `--cidr` (e.g. 10.0.0.0/16).'
    );
    return 1;
  }
  try {
    validateNetworkCidr(cidr);
  } catch (err) {
    output.error((err as Error).message);
    return 1;
  }

  const availabilityZoneIds = flags['--availability-zone-id'];
  if (availabilityZoneIds !== undefined && availabilityZoneIds.length !== 2) {
    output.error(
      'Provide exactly two `--availability-zone-id` values when specifying Availability Zones.'
    );
    return 1;
  }

  await selectConnexTeam(client, 'Select the team for this network');

  const body: JSONObject = { name, region, cidr };
  if (availabilityZoneIds) {
    body.awsAvailabilityZoneIds = availabilityZoneIds;
  }

  output.spinner('Creating network…');
  let network: ConnexNetwork;
  try {
    network = await client.fetch<ConnexNetwork>('/v1/connect/networks', {
      method: 'POST',
      body,
    });
  } catch (err: unknown) {
    output.stopSpinner();
    output.error(`Failed to create network: ${(err as Error).message}`);
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
    `Network ${chalk.bold(sanitizeForTerminal(network.name || network.id))} created.`
  );
  printNetworkDetails(network);
  return 0;
}
