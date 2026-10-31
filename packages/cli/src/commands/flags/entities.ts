import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { help } from '../help';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';
import { FlagsEntitiesTelemetryClient } from '../../util/telemetry/commands/flags/entities';
import entitiesLs from './entities-ls';
import entitiesCreate from './entities-create';
import entitiesUpdate from './entities-update';
import entitiesRm from './entities-rm';
import {
  flagsCommand,
  entitiesCreateSubcommand,
  entitiesListSubcommand,
  entitiesRemoveSubcommand,
  entitiesSubcommand,
  entitiesUpdateSubcommand,
} from './command';

const commands = {
  ls: { command: entitiesListSubcommand, run: entitiesLs },
  create: { command: entitiesCreateSubcommand, run: entitiesCreate },
  update: { command: entitiesUpdateSubcommand, run: entitiesUpdate },
  delete: { command: entitiesRemoveSubcommand, run: entitiesRm },
};
const aliases = Object.fromEntries(
  Object.entries(commands).map(([name, { command }]) => [
    name,
    getCommandAliases(command),
  ])
);

export async function entities(client: Client): Promise<number> {
  const telemetry = new FlagsEntitiesTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  try {
    const parsed = parseArguments(
      client.argv.slice(4),
      getFlagsSpecification(entitiesSubcommand.options),
      { permissive: true }
    );
    const { subcommand, args, subcommandOriginal } = getSubcommand(
      parsed.args,
      aliases
    );
    const entry =
      typeof subcommand === 'string'
        ? commands[subcommand as keyof typeof commands]
        : undefined;
    if (parsed.flags['--help'] || !entry) {
      if (parsed.flags['--help']) {
        telemetry.trackCliFlagHelp(
          'flags entities',
          entry ? subcommandOriginal : undefined
        );
      } else {
        output.fatal(getInvalidSubcommand(aliases));
      }
      output.print(
        help(entry?.command ?? entitiesSubcommand, {
          stream: client.stderr,
          parent: entry
            ? { ...entitiesSubcommand, name: 'flags entities' }
            : flagsCommand,
          columns: client.stderr.columns,
        })
      );
      return parsed.flags['--help'] ? 0 : 2;
    }
    telemetry.trackSubcommand(subcommand as string, subcommandOriginal);
    if (subcommand === 'create' && subcommandOriginal === 'add') {
      warnDeprecatedSubcommand(
        client,
        'flags entities add',
        'flags entities create'
      );
    }
    if (subcommand === 'delete' && subcommandOriginal === 'remove') {
      warnDeprecatedSubcommand(
        client,
        'flags entities remove',
        'flags entities delete'
      );
    }
    return await entry.run(client, args);
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }
}
