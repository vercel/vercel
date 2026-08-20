import type Client from '../../util/client';
import { groupsSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import getScope from '../../util/get-scope';
import inspect from './inspect';
import list from './list';
import type { AlertsTelemetryClient } from '../../util/telemetry/commands/alerts';

export default async function groups(
  client: Client,
  argv: string[],
  telemetry: AlertsTelemetryClient
): Promise<number> {
  let parsed;
  try {
    parsed = parseArguments(
      argv,
      getFlagsSpecification(groupsSubcommand.options)
    );
  } catch (error) {
    printError(error);
    return 1;
  }

  const action = parsed.args[0] ?? 'ls';
  const groupId = parsed.args[1];

  if (action === 'ls' || action === 'list') {
    telemetry.trackCliSubcommandGroups('groups ls');
    return list(client, telemetry);
  }

  if (action === 'inspect') {
    if (!groupId) {
      output.error('Usage: vercel alerts groups inspect <groupId>');
      return 2;
    }
    telemetry.trackCliSubcommandGroups('groups inspect');
    return inspect(client, [groupId]);
  }

  if (action !== 'enable' && action !== 'disable') {
    output.error('Usage: vercel alerts groups ls|inspect|enable|disable');
    return 2;
  }

  if (!groupId) {
    output.error(`Usage: vercel alerts groups ${action} <groupId>`);
    return 2;
  }

  const formatResult = validateJsonOutput(parsed.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;

  try {
    const { team } = await getScope(client);
    if (!team) {
      output.error('No team scope found.');
      return 1;
    }
    const query = new URLSearchParams({ teamId: team.id });
    const response = await client.fetch<Record<string, unknown>>(
      `/alerts/v3/groups/${encodeURIComponent(groupId)}?${query.toString()}`,
      {
        method: 'PATCH',
        body: { enabled: action === 'enable' },
        json: true,
      }
    );
    telemetry.trackCliSubcommandGroups(`groups ${action}`);
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify({ action, groupId, response }, null, 2)}\n`
      );
    } else {
      output.success(`Alert group ${groupId} ${action}d.`);
    }
    return 0;
  } catch (error) {
    printError(error);
    return 1;
  }
}
