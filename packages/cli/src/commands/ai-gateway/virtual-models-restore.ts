import chalk from 'chalk';
import type Client from '../../util/client';
import { restoreVirtualModel } from '../../util/ai-gateway/virtual-models';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AiGatewayVirtualModelsRestoreTelemetryClient } from '../../util/telemetry/commands/ai-gateway/virtual-models-restore';
import { virtualModelsRestoreSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';

export default async function restore(client: Client, argv: string[]) {
  const telemetry = new AiGatewayVirtualModelsRestoreTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    virtualModelsRestoreSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { args, flags: opts } = parsedArgs;

  const [slug] = args;
  telemetry.trackCliArgumentSlug(slug);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  if (!slug) {
    output.error(
      `${getCommandName('ai-gateway virtual-models restore <slug>')} expects a virtual model slug.`
    );
    return 2;
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  const restoreStamp = stamp();
  output.spinner('Restoring virtual model');

  try {
    const virtualModel = await restoreVirtualModel(client, slug);
    output.stopSpinner();
    if (asJson) {
      client.stdout.write(`${JSON.stringify(virtualModel, null, 2)}\n`);
    } else {
      output.success(
        `Virtual model ${chalk.bold(slug)} restored ${restoreStamp()}. Call it as ${chalk.bold(`vmc/${slug}`)}.`
      );
    }
    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err) && err.status === 404) {
      output.error(`Virtual model "${slug}" not found.`);
      return 1;
    }
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }
}
