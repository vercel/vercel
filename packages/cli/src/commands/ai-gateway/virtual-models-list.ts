import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import {
  listVirtualModelsPage,
  type VirtualModel,
} from '../../util/ai-gateway/virtual-models';
import { parseListLimit, type Page } from '../../util/pagination';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import output from '../../output-manager';
import { AiGatewayVirtualModelsListTelemetryClient } from '../../util/telemetry/commands/ai-gateway/virtual-models-list';
import { virtualModelsListSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { renderResource } from '../../util/ai-gateway/output';

export default async function list(client: Client, argv: string[]) {
  const telemetry = new AiGatewayVirtualModelsListTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    virtualModelsListSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }
  const { flags: opts } = parsedArgs;

  const includeArchived = Boolean(opts['--include-archived']);
  const limitFlag = opts['--limit'] as number | undefined;
  const next = opts['--next'] as string | undefined;
  telemetry.trackCliFlagIncludeArchived(opts['--include-archived']);
  telemetry.trackCliOptionLimit(limitFlag);
  telemetry.trackCliOptionNext(next);
  telemetry.trackCliOptionFormat(opts['--format']);

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }

  let limit: number;
  try {
    limit = parseListLimit(limitFlag);
  } catch (err) {
    output.error((err as Error).message);
    return 1;
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  return renderResource<Page<VirtualModel>>(client, {
    asJson: formatResult.jsonOutput,
    spinnerText: 'Fetching virtual models',
    fetch: () =>
      listVirtualModelsPage(client, { limit, next, includeArchived }),
    toJSON: page => ({
      virtualModels: page.items,
      pagination: { next: page.next },
    }),
    isEmpty: page => page.items.length === 0,
    emptyMessage: next
      ? 'No more virtual models.'
      : `No virtual models found. Create one with ${getCommandName('ai-gateway virtual-models create')}.`,
    header: () => 'Virtual models',
    renderTable: page => printVirtualModelsTable(page.items),
    next: page => page.next,
  });
}

function printVirtualModelsTable(virtualModels: VirtualModel[]) {
  return `${table(
    [
      ['slug', 'kind', 'model', 'status'].map(header => chalk.gray(header)),
      ...virtualModels.map(vm => [
        vm.virtualModelSlug,
        vm.kind ?? 'alias',
        vm.modelSlug ?? chalk.gray('–'),
        vm.status ?? 'active',
      ]),
    ],
    { align: ['l', 'l', 'l', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}
