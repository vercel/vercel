import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandAliases } from '..';
import { type Command, help } from '../help';
import output from '../../output-manager';
import { ExperimentsTelemetryClient } from '../../util/telemetry/commands/experiments';
import analyze from './analyze';
import create from './create';
import decide from './decide';
import deleteExperiment from './delete';
import diagnose from './diagnose';
import inspect from './inspect';
import list from './list';
import openExperiment from './open';
import reseedEnrollment from './reseed-enrollment';
import restartAnalysis from './restart-analysis';
import returnToDraft from './return-to-draft';
import setRamp from './set-ramp';
import start from './start';
import update from './update';
import {
  analyzeSubcommand,
  createSubcommand,
  decideSubcommand,
  deleteSubcommand,
  diagnoseSubcommand,
  experimentsCommand,
  inspectSubcommand,
  listSubcommand,
  openSubcommand,
  reseedEnrollmentSubcommand,
  restartAnalysisSubcommand,
  returnToDraftSubcommand,
  setRampSubcommand,
  startSubcommand,
  updateSubcommand,
} from './command';

const COMMAND_CONFIG = {
  list: getCommandAliases(listSubcommand),
  inspect: getCommandAliases(inspectSubcommand),
  create: getCommandAliases(createSubcommand),
  update: getCommandAliases(updateSubcommand),
  start: getCommandAliases(startSubcommand),
  'set-ramp': getCommandAliases(setRampSubcommand),
  'restart-analysis': getCommandAliases(restartAnalysisSubcommand),
  'reseed-enrollment': getCommandAliases(reseedEnrollmentSubcommand),
  'return-to-draft': getCommandAliases(returnToDraftSubcommand),
  decide: getCommandAliases(decideSubcommand),
  analyze: getCommandAliases(analyzeSubcommand),
  diagnose: getCommandAliases(diagnoseSubcommand),
  open: getCommandAliases(openSubcommand),
  delete: getCommandAliases(deleteSubcommand),
};

export default async function experiments(client: Client): Promise<number> {
  const telemetry = new ExperimentsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  let parsed;
  try {
    parsed = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(experimentsCommand.options),
      { permissive: true }
    );
  } catch (error) {
    printError(error);
    return 2;
  }

  const subArgs = parsed.args.slice(1);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );
  const needHelp = parsed.flags['--help'];

  if (!subcommand) {
    telemetry.trackCliFlagHelp('experiments', subcommand);
    output.print(
      help(experimentsCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return needHelp ? 0 : 2;
  }

  const commands: Record<
    keyof typeof COMMAND_CONFIG,
    {
      command: Command;
      run: (client: Client, argv: string[]) => Promise<number>;
    }
  > = {
    list: { command: listSubcommand, run: list },
    inspect: { command: inspectSubcommand, run: inspect },
    create: { command: createSubcommand, run: create },
    update: { command: updateSubcommand, run: update },
    start: { command: startSubcommand, run: start },
    'set-ramp': { command: setRampSubcommand, run: setRamp },
    'restart-analysis': {
      command: restartAnalysisSubcommand,
      run: restartAnalysis,
    },
    'reseed-enrollment': {
      command: reseedEnrollmentSubcommand,
      run: reseedEnrollment,
    },
    'return-to-draft': {
      command: returnToDraftSubcommand,
      run: returnToDraft,
    },
    decide: { command: decideSubcommand, run: decide },
    analyze: { command: analyzeSubcommand, run: analyze },
    diagnose: { command: diagnoseSubcommand, run: diagnose },
    open: { command: openSubcommand, run: openExperiment },
    delete: { command: deleteSubcommand, run: deleteExperiment },
  };
  const selectedName = subcommand as keyof typeof COMMAND_CONFIG;
  const selected = commands[selectedName];
  if (needHelp) {
    telemetry.trackCliFlagHelp('experiments', subcommandOriginal);
    output.print(
      help(selected.command, {
        stream: client.stderr,
        parent: experimentsCommand,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }
  telemetry.trackSubcommand(
    selectedName,
    Array.isArray(subcommandOriginal)
      ? (subcommandOriginal[0] ?? selectedName)
      : subcommandOriginal
  );
  return selected.run(client, args);
}
