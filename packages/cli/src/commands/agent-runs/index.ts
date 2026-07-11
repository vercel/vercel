import { help, type Command } from '../help';
import {
  agentRunsCommand,
  inspectSubcommand,
  listSubcommand,
  projectsSubcommand,
  traceSubcommand,
} from './command';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import getSubcommand from '../../util/get-subcommand';
import { getCommandAliases } from '..';
import output from '../../output-manager';
import { AgentRunsTelemetryClient } from '../../util/telemetry/commands/agent-runs';
import list from './list';
import inspect from './inspect';
import trace from './trace';
import projects from './projects';

const COMMAND_CONFIG = {
  list: getCommandAliases(listSubcommand),
  inspect: getCommandAliases(inspectSubcommand),
  trace: getCommandAliases(traceSubcommand),
  projects: getCommandAliases(projectsSubcommand),
};

export default async function agentRuns(client: Client): Promise<number> {
  const telemetry = new AgentRunsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(agentRunsCommand.options);

  let parsedArgs;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );
  const needHelp = parsedArgs.flags['--help'];

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: agentRunsCommand,
        columns: client.stderr.columns,
      })
    );
  }

  if (!subcommand) {
    const unknown = subArgs.find(arg => !arg.startsWith('-'));
    if (unknown) {
      output.error(`Unknown subcommand: ${unknown}`);
      output.print(help(agentRunsCommand, { columns: client.stderr.columns }));
      return 1;
    }
    if (needHelp) {
      telemetry.trackCliFlagHelp('agent-runs');
    }
    output.print(help(agentRunsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'list': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('agent-runs', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return await list(client);
    }
    case 'inspect': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('agent-runs', subcommandOriginal);
        printHelp(inspectSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return await inspect(client);
    }
    case 'trace': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('agent-runs', subcommandOriginal);
        printHelp(traceSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandTrace(subcommandOriginal);
      return await trace(client);
    }
    case 'projects': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('agent-runs', subcommandOriginal);
        printHelp(projectsSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandProjects(subcommandOriginal);
      return await projects(client);
    }
    default: {
      output.error(`Unknown subcommand: ${subcommandOriginal}`);
      output.print(help(agentRunsCommand, { columns: client.stderr.columns }));
      return 1;
    }
  }
}
