import type Client from '../../util/client';
import output from '../../output-manager';
import { help, type Command } from '../help';
import {
  getRulesAddBodyExamplesHelp,
  getRulesUpdateBodyExamplesHelp,
} from './add-help';
import {
  monitorsAddSubcommand,
  monitorsCommand,
  monitorsInspectSubcommand,
  monitorsLsSubcommand,
  monitorsRmSubcommand,
  monitorsSchemaSubcommand,
  monitorsUpdateSubcommand,
} from './command';

export function printMonitorsHelp(client: Client, nested?: string): void {
  function printHelp(command: Command, extra?: string): void {
    const helpOutput = help(command, {
      parent: monitorsCommand,
      columns: client.stderr.columns,
    });
    output.print(extra ? `${helpOutput}\n${extra}` : helpOutput);
  }

  if (nested === 'ls' || nested === 'list') {
    printHelp(monitorsLsSubcommand);
    return;
  }
  if (nested === 'schema') {
    printHelp(monitorsSchemaSubcommand);
    return;
  }
  if (nested === 'add' || nested === 'create') {
    printHelp(monitorsAddSubcommand, getRulesAddBodyExamplesHelp());
    return;
  }
  if (nested === 'inspect' || nested === 'get') {
    printHelp(monitorsInspectSubcommand);
    return;
  }
  if (nested === 'rm' || nested === 'remove' || nested === 'delete') {
    printHelp(monitorsRmSubcommand);
    return;
  }
  if (nested === 'update' || nested === 'patch') {
    printHelp(monitorsUpdateSubcommand, getRulesUpdateBodyExamplesHelp());
    return;
  }
  output.print(help(monitorsCommand, { columns: client.stderr.columns }));
}
