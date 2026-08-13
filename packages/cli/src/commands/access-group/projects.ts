import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import list from './projects-list';
import add from './projects-add';
import update from './projects-update';
import rm from './projects-remove';
import {
  projectsSubcommand,
  projectsListSubcommand,
  projectsAddSubcommand,
  projectsUpdateSubcommand,
  projectsRemoveSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { AccessGroupProjectsTelemetryClient } from '../../util/telemetry/commands/access-group/projects';
import { printError } from '../../util/error';

const COMMAND_CONFIG = {
  list: getCommandAliases(projectsListSubcommand),
  add: getCommandAliases(projectsAddSubcommand),
  update: getCommandAliases(projectsUpdateSubcommand),
  rm: getCommandAliases(projectsRemoveSubcommand),
};

export default async function projects(client: Client): Promise<number> {
  const telemetry = new AccessGroupProjectsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const flagsSpecification = getFlagsSpecification(projectsSubcommand.options);
  let parsedArgs;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(2);
  const { subcommand, subcommandOriginal, args } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('access-group projects');
    output.print(help(projectsSubcommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: projectsSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('access-group projects', subcommandOriginal);
        printHelp(projectsAddSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('access-group projects', subcommandOriginal);
        printHelp(projectsUpdateSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return update(client, args);
    case 'rm':
      if (needHelp) {
        telemetry.trackCliFlagHelp('access-group projects', subcommandOriginal);
        printHelp(projectsRemoveSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rm(client, args);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('access-group projects', subcommandOriginal);
        printHelp(projectsListSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
  }
}
