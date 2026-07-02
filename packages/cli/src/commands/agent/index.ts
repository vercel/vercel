import { help, type Command } from '../help';
import {
  agentCommand,
  initSubcommand,
  inspectSubcommand,
  projectsSubcommand,
  runsSubcommand,
  traceSubcommand,
} from './command';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import getSubcommand from '../../util/get-subcommand';
import { getCommandAliases } from '..';
import output from '../../output-manager';
import { AgentTelemetryClient } from '../../util/telemetry/commands/agent';
import { AgentInitTelemetryClient } from '../../util/telemetry/commands/agent/init';
import agentInit from './init';
import runs from './runs';
import inspect from './inspect';
import trace from './trace';
import projects from './projects';

const COMMAND_CONFIG = {
  init: getCommandAliases(initSubcommand),
  runs: getCommandAliases(runsSubcommand),
  inspect: getCommandAliases(inspectSubcommand),
  trace: getCommandAliases(traceSubcommand),
  projects: getCommandAliases(projectsSubcommand),
};

export default async function agent(client: Client): Promise<number> {
  const telemetry = new AgentTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(agentCommand.options);

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
      help(command, { parent: agentCommand, columns: client.stderr.columns })
    );
  }

  if (needHelp && !subcommand) {
    telemetry.trackCliFlagHelp('agent');
    output.print(help(agentCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'runs': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('agent', subcommandOriginal);
        printHelp(runsSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRuns(subcommandOriginal);
      return await runs(client);
    }
    case 'inspect': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('agent', subcommandOriginal);
        printHelp(inspectSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return await inspect(client);
    }
    case 'trace': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('agent', subcommandOriginal);
        printHelp(traceSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandTrace(subcommandOriginal);
      return await trace(client);
    }
    case 'projects': {
      if (needHelp) {
        telemetry.trackCliFlagHelp('agent', subcommandOriginal);
        printHelp(projectsSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandProjects(subcommandOriginal);
      return await projects(client);
    }
    default: {
      if (
        subcommand !== 'init' &&
        subArgs.length > 0 &&
        !subArgs[0].startsWith('-')
      ) {
        output.error(`Unknown subcommand: ${subArgs[0]}`);
        output.print(help(agentCommand, { columns: client.stderr.columns }));
        return 1;
      }
      if (needHelp) {
        telemetry.trackCliFlagHelp('agent', subcommandOriginal);
        printHelp(initSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandInit(subcommandOriginal);

      const initTelemetry = new AgentInitTelemetryClient({
        opts: {
          store: client.telemetryEventStore,
        },
      });
      let initParsedArgs;
      try {
        initParsedArgs = parseArguments(
          client.argv.slice(2),
          getFlagsSpecification(initSubcommand.options)
        );
      } catch (error) {
        printError(error);
        return 1;
      }
      const yes = initParsedArgs.flags['--yes'] ?? false;
      initTelemetry.trackCliFlagYes(yes);
      return await agentInit(client, yes);
    }
  }
}
