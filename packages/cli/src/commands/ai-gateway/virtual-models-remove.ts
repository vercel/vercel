import chalk from 'chalk';
import type Client from '../../util/client';
import { deleteVirtualModel } from '../../util/ai-gateway/virtual-models';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AiGatewayVirtualModelsRemoveTelemetryClient } from '../../util/telemetry/commands/ai-gateway/virtual-models-remove';
import { virtualModelsRemoveSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';

export default async function remove(client: Client, argv: string[]) {
  const telemetry = new AiGatewayVirtualModelsRemoveTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    virtualModelsRemoveSubcommand.options
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
      `${getCommandName('ai-gateway virtual-models delete <slug>')} expects a virtual model slug.`
    );
    return 2;
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  const removeStamp = stamp();
  output.spinner('Deleting virtual model');

  try {
    await deleteVirtualModel(client, slug);
    output.stopSpinner();
    if (asJson) {
      client.stdout.write(
        `${JSON.stringify({ virtualModelSlug: slug, removed: true }, null, 2)}\n`
      );
    } else {
      output.success(
        `Virtual model ${chalk.bold(slug)} deleted ${removeStamp()}. Restore it with ${getCommandName(`ai-gateway virtual-models restore ${slug}`)}.`
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
