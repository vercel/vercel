import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import {
  getVirtualModel,
  type VirtualModel,
} from '../../util/ai-gateway/virtual-models';
import { ensureTeam } from '../../util/ai-gateway/ensure-team';
import output from '../../output-manager';
import { AiGatewayVirtualModelsInspectTelemetryClient } from '../../util/telemetry/commands/ai-gateway/virtual-models-inspect';
import { virtualModelsInspectSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { renderResource } from '../../util/ai-gateway/output';

export default async function inspect(client: Client, argv: string[]) {
  const telemetry = new AiGatewayVirtualModelsInspectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    virtualModelsInspectSubcommand.options
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

  if (!slug) {
    output.error(
      `${getCommandName('ai-gateway virtual-models inspect <slug>')} expects a virtual model slug.`
    );
    return 2;
  }

  if (!(await ensureTeam(client))) {
    return 1;
  }

  return renderResource<VirtualModel>(client, {
    asJson: formatResult.jsonOutput,
    spinnerText: `Fetching virtual model ${slug}`,
    fetch: () => getVirtualModel(client, slug),
    toJSON: virtualModel => virtualModel,
    isEmpty: () => false,
    emptyMessage: '',
    header: virtualModel =>
      `Virtual model ${chalk.bold(virtualModel.virtualModelSlug)}`,
    renderTable: printVirtualModelDetails,
    notFoundMessage: `Virtual model "${slug}" not found.`,
  });
}

function dim(value: string) {
  return chalk.gray(value);
}

function printVirtualModelDetails(vm: VirtualModel) {
  const rows: Array<[string, string | undefined]> = [
    ['slug', vm.virtualModelSlug],
    ['kind', vm.kind ?? 'alias'],
    ['model', vm.modelSlug],
    ['display name', vm.displayName],
    ['description', vm.description],
    ['status', vm.status ?? 'active'],
    ['visibility', vm.visibility],
    ['base url', vm.baseUrl],
    ['fallback models', vm.models?.join(', ')],
    ['provider order', vm.providerOrder?.join(', ')],
    ['provider only', vm.providerOnly?.join(', ')],
    ['observability tags', vm.observabilityTags?.join(', ')],
    ['inference region', formatRegion(vm.inferenceRegion)],
    ['sort', vm.sort],
    ['has', vm.has?.join(', ')],
    ['caching', vm.caching],
    ['service tier', vm.serviceTier],
    ['provider timeouts', formatTimeouts(vm.providerTimeouts)],
    ['speed', vm.speed],
    ['allow fallback from fast', yesNo(vm.allowFallbackFromFast)],
    ['zero data retention', yesNo(vm.zeroDataRetention)],
    ['disallow prompt training', yesNo(vm.disallowPromptTraining)],
    ['created', new Date(vm.createdAt).toLocaleString()],
    ['updated', new Date(vm.updatedAt).toLocaleString()],
  ];

  return `${table(
    rows
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([label, value]) => [dim(label), value as string]),
    { align: ['l', 'l'], hsep: 4 }
  ).replace(/^/gm, '  ')}\n\n`;
}

function yesNo(value: boolean | undefined) {
  return value === undefined ? undefined : value ? 'yes' : 'no';
}

function formatRegion(region: VirtualModel['inferenceRegion']) {
  if (!region) return undefined;
  const base = [region.scope, region.geoRegion, region.providerRegion]
    .filter(Boolean)
    .join(' / ');
  const providers = region.providers
    ? Object.entries(region.providers)
        .map(([name, value]) =>
          value === null
            ? `${name}: none`
            : `${name}: ${[value.scope, value.geoRegion, value.providerRegion].filter(Boolean).join(' / ')}`
        )
        .join(', ')
    : undefined;
  return [base, providers].filter(Boolean).join(' | ') || undefined;
}

function formatTimeouts(timeouts: VirtualModel['providerTimeouts']) {
  if (!timeouts?.byok) return undefined;
  return Object.entries(timeouts.byok)
    .map(([provider, ms]) => `${provider}: ${ms}ms`)
    .join(', ');
}
