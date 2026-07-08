import { help } from '../help';
import { askCommand } from './command';
import ask from './ask';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { AskTelemetryClient } from '../../util/telemetry/commands/ask';

export default async function askEntrypoint(client: Client): Promise<number> {
  const telemetry = new AskTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(askCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('ask');
    output.print(help(askCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const prompt = parsedArgs.args.slice(1).join(' ').trim() || undefined;
  const sessionId = parsedArgs.flags['--session'];
  const noWait = parsedArgs.flags['--no-wait'] ?? false;
  const verbose = parsedArgs.flags['--verbose'] ?? false;
  const json = parsedArgs.flags['--json'] ?? false;

  telemetry.trackCliArgumentPrompt(prompt);
  telemetry.trackCliOptionSession(sessionId);
  telemetry.trackCliFlagNoWait(noWait);
  telemetry.trackCliFlagVerbose(verbose);
  telemetry.trackCliFlagJson(json);

  try {
    return await ask(client, { prompt, sessionId, noWait, verbose, json });
  } catch (error) {
    printError(error);
    return 1;
  }
}
