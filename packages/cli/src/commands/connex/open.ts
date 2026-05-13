import chalk from 'chalk';
import open from 'open';
import output from '../../output-manager';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import getScope from '../../util/get-scope';
import { selectConnexTeam } from '../../util/connex/select-team';
import { validateJsonOutput } from '../../util/output-format';

export async function openClient(
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

  const clientIdOrUid = args[0];
  if (!clientIdOrUid) {
    output.error(
      'Missing connector ID or UID. Usage: vercel connect open <id>'
    );
    return 1;
  }

  await selectConnexTeam(client, 'Select the team whose connector to open');

  const { team } = await getScope(client);
  if (!team) {
    output.error('No team resolved. Run `vercel switch` or pass `--scope`.');
    return 1;
  }

  output.spinner('Looking up connector…');
  let resolvedId: string;
  try {
    // Resolve to the scl_ id even if the caller passed a UID. The dashboard
    // route is a single [clientId] segment and can't hold slashes from UIDs
    // like `slack/my-bot`, so we always link by the canonical id.
    const resolved = await client.fetch<{ id: string }>(
      `/v1/connex/clients/${encodeURIComponent(clientIdOrUid)}`
    );
    resolvedId = resolved.id;
  } catch (err: unknown) {
    output.stopSpinner();
    const status = (err as { status?: number }).status;
    if (status === 404) {
      output.error(
        `Connector ${chalk.bold(`"${clientIdOrUid}"`)} not found on team ${chalk.bold(team.slug)}, or Connect is not enabled for this team.`
      );
      return 1;
    }
    printError(err);
    return 1;
  }
  output.stopSpinner();

  const url = `https://vercel.com/${encodeURIComponent(team.slug)}/~/connex/${resolvedId}`;

  if (asJson) {
    client.stdout.write(`${JSON.stringify({ url }, null, 2)}\n`);
    return 0;
  }

  if (client.stdout.isTTY) {
    output.print(
      `Opening connector ${chalk.bold(clientIdOrUid)} in the dashboard…\n`
    );
    open(url);
    return 0;
  }

  client.stdout.write(`${url}\n`);
  return 0;
}
