import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { help } from '../help';
import { openapiCommand } from './command';
import { OpenapiTelemetryClient } from '../../util/telemetry/commands/openapi';
import output from '../../output-manager';
import { runOpenapiCli } from './run-openapi-cli';

export { buildUnknownTagMessage } from './run-openapi-cli';

export default async function openapi(client: Client): Promise<number> {
  const telemetryClient = new OpenapiTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  const flagsSpec = getFlagsSpecification(openapiCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpec, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const { flags } = parsedArgs;
  const needHelp = flags['--help'];

  if (needHelp) {
    telemetryClient.trackCliFlagHelp('openapi');
    output.print(help(openapiCommand, { columns: client.stderr.columns }));
    return 2;
  }

  return runOpenapiCli(client, parsedArgs, telemetryClient);
}
