import chalk from 'chalk';
import type Client from '../../util/client';
import {
  updateVirtualModel,
  parseConfigFlag,
  splitList,
  UPDATEABLE_FIELDS,
  type VirtualModelInput,
} from '../../util/ai-gateway/virtual-models';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import stamp from '../../util/output/stamp';
import output from '../../output-manager';
import { AiGatewayVirtualModelsEditTelemetryClient } from '../../util/telemetry/commands/ai-gateway/virtual-models-edit';
import { virtualModelsEditSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';

export default async function edit(client: Client, argv: string[]) {
  const telemetry = new AiGatewayVirtualModelsEditTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    virtualModelsEditSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { args, flags: opts } = parsedArgs;

  const config = parseConfigFlag(
    opts['--config'] as string | undefined,
    undefined,
    UPDATEABLE_FIELDS
  );
  if (!config.ok) {
    output.error(config.error);
    return 1;
  }

  const [slug] = args;
  telemetry.trackCliArgumentSlug(slug);
  telemetry.trackCliOptionModel(opts['--model']);
  telemetry.trackCliOptionDisplayName(opts['--display-name']);
  telemetry.trackCliOptionDescription(opts['--description']);
  telemetry.trackCliOptionProviderOrder(opts['--provider-order']);
  telemetry.trackCliOptionProviderOnly(opts['--provider-only']);
  telemetry.trackCliOptionConfig(opts['--config']);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  if (!slug) {
    output.error(
      `${getCommandName('ai-gateway virtual-models update <slug>')} expects a virtual model slug.`
    );
    return 2;
  }

  const updates: Record<string, unknown> = {
    ...config.value,
    ...definedOnly({
      modelSlug: opts['--model'] as string | undefined,
      displayName: opts['--display-name'] as string | undefined,
      description: opts['--description'] as string | undefined,
      providerOrder: splitList(opts['--provider-order'] as string | undefined),
      providerOnly: splitList(opts['--provider-only'] as string | undefined),
    }),
  };
  delete updates.virtualModelSlug;

  if (Object.keys(updates).length === 0) {
    output.error(
      'Provide at least one field to change, with an option or --config.'
    );
    return 2;
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  const updateStamp = stamp();
  output.spinner(`Updating virtual model ${slug}`);

  try {
    const virtualModel = await updateVirtualModel(client, {
      ...updates,
      virtualModelSlug: slug,
    } as unknown as VirtualModelInput);

    output.stopSpinner();

    if (asJson) {
      client.stdout.write(`${JSON.stringify(virtualModel, null, 2)}\n`);
    } else {
      output.success(
        `Virtual model ${chalk.bold(virtualModel.virtualModelSlug)} updated ${updateStamp()}`
      );
    }

    return 0;
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }
}

function definedOnly(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}
