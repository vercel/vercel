import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getCommandAliases } from '..';
import output from '../../output-manager';
import { CommentsTelemetryClient } from '../../util/telemetry/commands/comments';
import {
  commentsCommand,
  listSubcommand,
  inspectSubcommand,
  openSubcommand,
  replySubcommand,
  resolveSubcommand,
  reopenSubcommand,
  editSubcommand,
  deleteSubcommand,
} from './command';

const COMMAND_CONFIG = {
  list: getCommandAliases(listSubcommand),
  inspect: getCommandAliases(inspectSubcommand),
  open: getCommandAliases(openSubcommand),
  reply: getCommandAliases(replySubcommand),
  resolve: getCommandAliases(resolveSubcommand),
  reopen: getCommandAliases(reopenSubcommand),
  edit: getCommandAliases(editSubcommand),
  delete: getCommandAliases(deleteSubcommand),
};

export default async function comments(client: Client): Promise<number> {
  const telemetry = new CommentsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(commentsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('comments', subcommand);
    output.print(help(commentsCommand, { columns: client.stderr.columns }));
    return 0;
  }

  function printSubcommandHelp(command: Command) {
    output.print(
      help(command, { parent: commentsCommand, columns: client.stderr.columns })
    );
  }

  function handleHelp(command: Command): boolean {
    if (needHelp) {
      telemetry.trackCliFlagHelp('comments', subcommandOriginal);
      printSubcommandHelp(command);
      return true;
    }
    return false;
  }

  switch (subcommand) {
    case 'inspect': {
      if (handleHelp(inspectSubcommand)) return 0;
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return (await import('./inspect')).default(client, telemetry);
    }
    case 'open': {
      if (handleHelp(openSubcommand)) return 0;
      telemetry.trackCliSubcommandOpen(subcommandOriginal);
      return (await import('./open')).default(client, telemetry);
    }
    case 'reply': {
      if (handleHelp(replySubcommand)) return 0;
      telemetry.trackCliSubcommandReply(subcommandOriginal);
      return (await import('./reply')).default(client, telemetry);
    }
    case 'resolve': {
      if (handleHelp(resolveSubcommand)) return 0;
      telemetry.trackCliSubcommandResolve(subcommandOriginal);
      return (await import('./resolve')).default(client, telemetry, true);
    }
    case 'reopen': {
      if (handleHelp(reopenSubcommand)) return 0;
      telemetry.trackCliSubcommandReopen(subcommandOriginal);
      return (await import('./resolve')).default(client, telemetry, false);
    }
    case 'edit': {
      if (handleHelp(editSubcommand)) return 0;
      telemetry.trackCliSubcommandEdit(subcommandOriginal);
      return (await import('./edit')).default(client, telemetry);
    }
    case 'delete': {
      if (handleHelp(deleteSubcommand)) return 0;
      telemetry.trackCliSubcommandDelete(subcommandOriginal);
      return (await import('./delete')).default(client, telemetry);
    }
    default: {
      if (needHelp) {
        telemetry.trackCliFlagHelp('comments', subcommandOriginal);
        // `comments ls --help` shows list help; bare `comments --help` shows
        // the family help.
        if (subcommandOriginal !== 'default') {
          printSubcommandHelp(listSubcommand);
        } else {
          output.print(
            help(commentsCommand, { columns: client.stderr.columns })
          );
        }
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      const defaultInvocation = subcommandOriginal === 'default';
      return (await import('./list')).default(
        client,
        telemetry,
        defaultInvocation
      );
    }
  }
}
