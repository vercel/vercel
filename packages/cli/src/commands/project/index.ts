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
import rename from './rename';
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
  renameSubcommand,
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
import { tryOpenApiFallback } from '../../util/openapi';
import { resolveOpenApiTagForProjectsCli } from '../../util/openapi/matches-cli-api-tag';
import { autoInstallVercelPlugin } from '../../util/agent/auto-install-agentic';

const COMMAND_CONFIG = {
  inspect: getCommandAliases(inspectSubcommand),
  list: getCommandAliases(listSubcommand),
  members: getCommandAliases(membersSubcommand),
  accessGroups: getCommandAliases(accessGroupsSubcommand),
  add: getCommandAliases(addSubcommand),
  'access-summary': getCommandAliases(accessSummarySubcommand),
  checks: getCommandAliases(checksSubcommand),
  protection: getCommandAliases(protectionSubcommand),
  rename: getCommandAliases(renameSubcommand),
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

  let exitCode: number;

  switch (subcommand) {
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(inspectSubcommand);
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      exitCode = await inspect(client, args);
      break;
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(listSubcommand);
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      exitCode = await list(client, args);
      break;
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(addSubcommand);
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      exitCode = await add(client, args);
      break;
    case 'access-summary':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(accessSummarySubcommand);
      }
      telemetry.trackCliSubcommandAccessSummary(subcommandOriginal);
      exitCode = await accessSummary(client, args);
      break;
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
      exitCode = await checks(client, args);
      break;
    case 'members':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(membersSubcommand);
      }
      telemetry.trackCliSubcommandMembers(subcommandOriginal);
      exitCode = await members(client, args);
      break;
    case 'accessGroups':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(accessGroupsSubcommand);
      }
      telemetry.trackCliSubcommandAccessGroups(subcommandOriginal);
      exitCode = await accessGroups(client, args);
      break;
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
      exitCode = await protection(client, args);
      break;
    case 'webAnalytics':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(webAnalyticsSubcommand);
      }
      telemetry.trackCliSubcommandWebAnalytics(subcommandOriginal);
      exitCode = await webAnalytics(client, args);
      break;
    case 'speedInsights':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(speedInsightsSubcommand);
      }
      telemetry.trackCliSubcommandSpeedInsights(subcommandOriginal);
      exitCode = await speedInsights(client, args);
      break;
    case 'token':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(tokenSubcommand);
      }
      telemetry.trackCliSubcommandToken(subcommandOriginal);
      exitCode = await getOidcToken(client, args);
      break;
    case 'rename':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(renameSubcommand);
      }
      telemetry.trackCliSubcommandRename(subcommandOriginal);
      exitCode = await rename(client, args);
      break;
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(removeSubcommand);
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      exitCode = await rm(client, args);
      break;
    default: {
      const fallback = await tryOpenApiFallback(
        client,
        parsedArgs.args.slice(1),
        resolveOpenApiTagForProjectsCli
      );
      if (fallback !== null) {
        exitCode = fallback;
        break;
      }
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(projectCommand, { columns: client.stderr.columns }));
      return 2;
    }
  }

  if (exitCode === 0) {
    await autoInstallVercelPlugin(client);
  }

  return exitCode;
}
