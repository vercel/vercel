import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { schemaSubcommand } from './command';
import { parseSubcommandArgs, outputJson } from './shared';
import { firewallSchemas } from '../../util/firewall/schemas';
import { getCommandName } from '../../util/pkg-name';

export default async function schema(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, schemaSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const actionName = parsed.args[0];

  // No action specified — list all available actions
  if (!actionName) {
    const entries = Object.entries(firewallSchemas);

    if (entries.length === 0) {
      output.log(
        `No schemas available yet. Schemas are added as firewall commands are implemented.`
      );
      return 0;
    }

    output.print(`\n${chalk.bold('Available firewall actions:')}\n\n`);

    const maxNameLen = Math.max(
      ...Object.keys(firewallSchemas).map(k => k.length)
    );

    for (const [name, entry] of entries) {
      output.print(
        `  ${chalk.cyan(name.padEnd(maxNameLen))}  ${entry.description}\n`
      );
    }

    output.print(
      `\nRun ${chalk.cyan(getCommandName('firewall schema <action>'))} to see the full JSON schema.\n\n`
    );

    return 0;
  }

  // Specific action requested — dump JSON schema
  const entry = firewallSchemas[actionName];

  if (!entry) {
    output.error(
      `Unknown action "${actionName}". Run ${getCommandName('firewall schema')} to see available actions.`
    );
    return 1;
  }

  outputJson(client, {
    action: actionName,
    description: entry.description,
    schema: entry.schema,
  });

  return 0;
}
