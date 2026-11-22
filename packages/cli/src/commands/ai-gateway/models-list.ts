import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import { listModels, type Model } from '../../util/ai-gateway/models';
import {
  listVirtualModels,
  type VirtualModel,
} from '../../util/ai-gateway/virtual-models';
import output from '../../output-manager';
import { AiGatewayModelsListTelemetryClient } from '../../util/telemetry/commands/ai-gateway/models-list';
import { modelsListSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { renderResource } from '../../util/ai-gateway/output';

export default async function list(client: Client, argv: string[]) {
  const telemetry = new AiGatewayModelsListTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    modelsListSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { flags: opts } = parsedArgs;

  telemetry.trackCliOptionFormat(opts['--format']);
  telemetry.trackCliFlagVirtual(opts['--virtual'] as boolean | undefined);
  telemetry.trackCliFlagNoVirtual(opts['--no-virtual'] as boolean | undefined);

  const onlyVirtual = Boolean(opts['--virtual']);
  const hideVirtual = Boolean(opts['--no-virtual']);
  if (onlyVirtual && hideVirtual) {
    output.error('Pass only one of --virtual and --no-virtual.');
    return 2;
  }

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }

  return renderResource<Model[]>(client, {
    asJson: formatResult.jsonOutput,
    spinnerText: 'Fetching models',
    fetch: () => fetchModels(client, { onlyVirtual, hideVirtual }),
    toJSON: models => ({ models }),
    isEmpty: models => models.length === 0,
    emptyMessage: onlyVirtual ? 'No virtual models found.' : 'No models found.',
    header: () => 'Models',
    renderTable: printModelsTable,
  });
}

async function fetchModels(
  client: Client,
  filter: { onlyVirtual: boolean; hideVirtual: boolean }
): Promise<Model[]> {
  // --virtual is the whole result, so it needs a team and asks for one when
  // it can't be told; the merged list adds virtual models only when it can.
  const teamId = filter.hideVirtual
    ? undefined
    : await client.resolveCurrentTeam({ ask: filter.onlyVirtual });
  const fetchVirtual =
    teamId && !filter.hideVirtual
      ? // --virtual is the whole result, so failures must surface; merged mode degrades to catalog-only
        filter.onlyVirtual
        ? listVirtualModels(client)
        : listVirtualModels(client).catch(() => [] as VirtualModel[])
      : Promise.resolve([] as VirtualModel[]);
  const [catalog, virtualModels] = await Promise.all([
    filter.onlyVirtual ? Promise.resolve([]) : listModels(client),
    fetchVirtual,
  ]);
  // The team-scoped catalog can include VMCs too; drop those rows so they
  // don't duplicate (or leak past --no-virtual).
  const catalogModels = filter.hideVirtual
    ? catalog.filter(model => !model.id.startsWith('vmc/'))
    : catalog.filter(
        model =>
          !virtualModels.some(vmc => `vmc/${vmc.virtualModelSlug}` === model.id)
      );
  return [
    ...catalogModels,
    ...virtualModels.map(vmc => ({
      id: `vmc/${vmc.virtualModelSlug}`,
      object: 'model' as const,
      owned_by: 'you',
      name: vmc.displayName ?? vmc.virtualModelSlug,
      type: 'virtual',
    })),
  ];
}

function printModelsTable(models: Model[]) {
  return `${table(
    [
      ['id', 'name', 'owner', 'type'].map(header => chalk.gray(header)),
      ...models.map(model => [
        model.id,
        model.name ?? chalk.gray('–'),
        model.owned_by ?? chalk.gray('–'),
        model.type ?? chalk.gray('–'),
      ]),
    ],
    { align: ['l', 'l', 'l', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
