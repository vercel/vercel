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
import update from './update';
import rm from './rm';
import dangerouslyDeleteImmutableStaticAsset from './dangerously-delete-immutable-static-asset';
import pause from './pause';
import resume from './resume';
import getOidcToken from './token';
import speedInsights from './speed-insights';
import webAnalytics from './web-analytics';
import observability from './observability';
import priority from './priority';
import protection from './protection';
import {
  accessGroupsSubcommand,
  addSubcommand,
  accessSummarySubcommand,
  checksSubcommand,
  inspectSubcommand,
  listSubcommand,
  membersSubcommand,
  pauseSubcommand,
  dangerouslyDeleteImmutableStaticAssetSubcommand,
  projectCommand,
  protectionSubcommand,
  renameSubcommand,
  removeSubcommand,
  resumeSubcommand,
  speedInsightsSubcommand,
  observabilitySubcommand,
  prioritySubcommand,
  tokenSubcommand,
  updateSubcommand,
  webAnalyticsSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { ProjectTelemetryClient } from '../../util/telemetry/commands/project';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import getSubcommand from '../../util/get-subcommand';
import { tryOpenApiFallback } from '../../util/openapi';
import { resolveOpenApiTagForProjectsCli } from '../../util/openapi/matches-cli-api-tag';
import { handleCommandTypo } from '../../util/handle-command-typo';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';

const COMMAND_CONFIG = {
  inspect: getCommandAliases(inspectSubcommand),
  list: getCommandAliases(listSubcommand),
  members: getCommandAliases(membersSubcommand),
  accessGroups: getCommandAliases(accessGroupsSubcommand),
  add: getCommandAliases(addSubcommand),
  'access-summary': getCommandAliases(accessSummarySubcommand),
  checks: getCommandAliases(checksSubcommand),
  protection: getCommandAliases(protectionSubcommand),
  update: getCommandAliases(updateSubcommand),
  rename: getCommandAliases(renameSubcommand),
  delete: getCommandAliases(removeSubcommand),
  token: getCommandAliases(tokenSubcommand),
  speedInsights: getCommandAliases(speedInsightsSubcommand),
  webAnalytics: getCommandAliases(webAnalyticsSubcommand),
  pause: getCommandAliases(pauseSubcommand),
  'dangerously-delete-immutable-static-asset': getCommandAliases(
    dangerouslyDeleteImmutableStaticAssetSubcommand
  ),
  observability: getCommandAliases(observabilitySubcommand),
  priority: getCommandAliases(prioritySubcommand),
  resume: getCommandAliases(resumeSubcommand),
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
    printError(error, client);
    return 2;
  }

  let { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('project');
    output.print(
      help(projectCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
        parent: projectCommand,
        columns: client.stderr.columns,
      })
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
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      if (subcommandOriginal === 'add') {
        warnDeprecatedSubcommand(client, 'project add', 'project create');
      }
      exitCode = await add(client, args);
      break;
    case 'access-summary':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(accessSummarySubcommand);
      }
      telemetry.trackCliSubcommandAccessSummary(subcommandOriginal);
      if (subcommandOriginal === 'summary') {
        warnDeprecatedSubcommand(
          client,
          'project summary',
          'project access-summary'
        );
      }
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
      telemetry.trackCliSubcommandMembers(
        args[0] === 'add'
          ? 'members add'
          : args[0] === 'remove' || args[0] === 'rm'
            ? 'members remove'
            : subcommandOriginal
      );
      exitCode = await members(client, args);
      break;
    case 'accessGroups':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(accessGroupsSubcommand);
      }
      telemetry.trackCliSubcommandAccessGroups(subcommandOriginal);
      if (subcommandOriginal === 'accessgroups') {
        warnDeprecatedSubcommand(
          client,
          'project accessgroups',
          'project access-groups'
        );
      }
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
      telemetry.trackCliSubcommandWebAnalytics(
        args[0] === 'enable'
          ? 'web-analytics enable'
          : args[0] === 'disable'
            ? 'web-analytics disable'
            : subcommandOriginal
      );
      exitCode = await webAnalytics(client, args);
      break;
    case 'speedInsights':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(speedInsightsSubcommand);
      }
      telemetry.trackCliSubcommandSpeedInsights(
        args[0] === 'enable'
          ? 'speed-insights enable'
          : args[0] === 'disable'
            ? 'speed-insights disable'
            : subcommandOriginal
      );
      exitCode = await speedInsights(client, args);
      break;
    case 'pause':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(pauseSubcommand);
      }
      telemetry.trackCliSubcommandPause(subcommandOriginal);
      exitCode = await pause(client, args);
      break;
    case 'dangerously-delete-immutable-static-asset':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(dangerouslyDeleteImmutableStaticAssetSubcommand);
      }
      telemetry.trackCliSubcommandDangerouslyDeleteImmutableStaticAsset(
        subcommandOriginal
      );
      exitCode = await dangerouslyDeleteImmutableStaticAsset(client, args);
      break;
    case 'observability':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(observabilitySubcommand);
      }
      telemetry.trackCliSubcommandObservability(
        args[0] === 'enable'
          ? 'observability enable'
          : args[0] === 'disable'
            ? 'observability disable'
            : subcommandOriginal
      );
      exitCode = await observability(client, args);
      break;
    case 'priority':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(prioritySubcommand);
      }
      telemetry.trackCliSubcommandPriority(
        args[0] === 'enable'
          ? 'priority enable'
          : args[0] === 'disable'
            ? 'priority disable'
            : subcommandOriginal
      );
      if (subcommandOriginal === 'priority-project') {
        warnDeprecatedSubcommand(
          client,
          'project priority-project',
          'project priority'
        );
      }
      exitCode = await priority(client, args);
      break;
    case 'resume':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(resumeSubcommand);
      }
      telemetry.trackCliSubcommandResume(subcommandOriginal);
      if (subcommandOriginal === 'unpause') {
        warnDeprecatedSubcommand(client, 'project unpause', 'project resume');
      }
      exitCode = await resume(client, args);
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
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(updateSubcommand);
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      if (subcommandOriginal === 'set') {
        warnDeprecatedSubcommand(client, 'project set', 'project update');
      }
      exitCode = await update(client, args);
      break;
    case 'delete':
      if (needHelp) {
        telemetry.trackCliFlagHelp('project', subcommandOriginal);
        return printHelp(removeSubcommand);
      }
      telemetry.trackCliSubcommandDelete(subcommandOriginal);
      if (subcommandOriginal === 'remove') {
        warnDeprecatedSubcommand(client, 'project remove', 'project delete');
      }
      exitCode = await rm(client, args);
      break;
    default: {
      if (
        handleCommandTypo({
          client,
          command: parsedArgs.args[1],
          availableCommands: projectCommand.subcommands,
          helpCommand: 'project --help',
        })
      )
        return 2;
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
      output.print(
        help(projectCommand, {
          stream: client.stderr,
          columns: client.stderr.columns,
        })
      );
      return 2;
    }
  }

  return exitCode;
}
