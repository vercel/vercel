import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import add from './add';
import accessSummary from './access-summary';
import checks from './checks';
import inspect from './inspect';
import list from './list';
import members from './members';
import accessGroups from './access-groups';
import rm from './rm';
import getOidcToken from './token';
import speedInsights from './speed-insights';
import webAnalytics from './web-analytics';
import protection from './protection';
import {
  accessGroupsSubcommand,
  addSubcommand,
  accessSummarySubcommand,
  checksSubcommand,
  inspectSubcommand,
  listSubcommand,
  membersSubcommand,
  projectCommand,
  protectionSubcommand,
  removeSubcommand,
  speedInsightsSubcommand,
  tokenSubcommand,
  webAnalyticsSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { ProjectTelemetryClient } from '../../util/telemetry/commands/project';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import getSubcommand from '../../util/get-subcommand';

const COMMAND_CONFIG = {
  inspect: getCommandAliases(inspectSubcommand),
  list: getCommandAliases(listSubcommand),
  members: getCommandAliases(membersSubcommand),
  accessGroups: getCommandAliases(accessGroupsSubcommand),
  add: getCommandAliases(addSubcommand),
  'access-summary': getCommandAliases(accessSummarySubcommand),
  checks: getCommandAliases(checksSubcommand),
  protection: getCommandAliases(protectionSubcommand),
  remove: getCommandAliases(removeSubcommand),
  token: getCommandAliases(tokenSubcommand),
  speedInsights: getCommandAliases(speedInsightsSubcommand),
  webAnalytics: getCommandAliases(webAnalyticsSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new ProjectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(projectCommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  let { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('project');
    output.print(help(projectCommand, { columns: client.stderr.columns }));
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: projectCommand, columns: client.stderr.columns })
    );
    return 0;
  }

  if (!parsedArgs.args[1]) {
    subcommand = 'list';
  }

  switch (subcommand) {
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(inspectSubcommand);
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, args);
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(listSubcommand);
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(addSubcommand);
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    case 'access-summary':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(accessSummarySubcommand);
      }
      telemetry.trackCliSubcommandAccessSummary(subcommandOriginal);
      return accessSummary(client, args);
    case 'checks':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(checksSubcommand);
      }
      telemetry.trackCliSubcommandChecks(
        args[0] === 'add'
          ? 'checks add'
          : args[0] === 'remove' || args[0] === 'rm'
            ? 'checks remove'
            : subcommandOriginal
      );
      return checks(client, args);
    case 'members':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(membersSubcommand);
      }
      telemetry.trackCliSubcommandMembers(subcommandOriginal);
      return members(client, args);
    case 'accessGroups':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(accessGroupsSubcommand);
      }
      telemetry.trackCliSubcommandAccessGroups(subcommandOriginal);
      return accessGroups(client, args);
    case 'protection':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(protectionSubcommand);
      }
      telemetry.trackCliSubcommandProtection(
        args[0] === 'enable'
          ? 'protection enable'
          : args[0] === 'disable'
            ? 'protection disable'
            : subcommandOriginal
      );
      return protection(client, args);
    case 'webAnalytics':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(webAnalyticsSubcommand);
      }
      telemetry.trackCliSubcommandWebAnalytics(subcommandOriginal);
      return webAnalytics(client, args);
    case 'speedInsights':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(speedInsightsSubcommand);
      }
      telemetry.trackCliSubcommandSpeedInsights(subcommandOriginal);
      return speedInsights(client, args);
    case 'token':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(tokenSubcommand);
      }
      telemetry.trackCliSubcommandToken(subcommandOriginal);
      return getOidcToken(client, args);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(removeSubcommand);
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return rm(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(projectCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
