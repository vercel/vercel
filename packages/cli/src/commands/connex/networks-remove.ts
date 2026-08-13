import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { validateJsonOutput } from '../../util/output-format';
import { selectConnexTeam } from '../../util/connex/select-team';
import { sanitizeForTerminal } from '../../util/connex/sanitize';
import type { ConnexNetwork } from './types';

export async function networksRemove(
  client: Client,
  args: string[],
  flags: {
    '--yes'?: boolean;
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
  const skipConfirmation = !!flags['--yes'];

  if (asJson && !skipConfirmation) {
    output.error('--json requires --yes to skip confirmation prompts');
    return 1;
  }

  const networkId = args[0];
  if (!networkId) {
    output.error(
      'Missing network ID. Usage: vercel connect networks remove <id>'
    );
    return 1;
  }

  await selectConnexTeam(client, 'Select the team for this network');

  output.spinner('Retrieving network…');
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

  const displayName = sanitizeForTerminal(network.name || network.id);

  if (!skipConfirmation && !client.stdin.isTTY) {
    output.error(
      'Confirmation required. Use `--yes` to skip the confirmation prompt.'
    );
    return 1;
  }

  if (!skipConfirmation) {
    output.log(
      `Network ${chalk.bold(displayName)} will be deleted permanently.`
    );
    const confirmed = await client.input.confirm(
      `${chalk.red('Are you sure?')}`,
      false
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  try {
    output.spinner('Deleting network…');
    await client.fetch<unknown>(
      `/v1/connect/networks/${encodeURIComponent(network.id)}`,
      { method: 'DELETE' }
    );
  } catch (err: unknown) {
    output.stopSpinner();
    output.error(
      `A problem occurred when attempting to delete ${chalk.bold(displayName)}: ${(err as Error).message}`
    );
    return 1;
  }
  output.stopSpinner();

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ id: network.id, removed: true }, null, 2)}\n`
    );
    return 0;
  }

  output.success(`Network ${chalk.bold(displayName)} successfully removed.`);
  return 0;
}
