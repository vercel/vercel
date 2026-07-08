import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import {
  listModelEndpoints,
  type ModelEndpoint,
  type ModelWithEndpoints,
} from '../../util/ai-gateway/models';
import output from '../../output-manager';
import { AiGatewayModelsEndpointsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/models-endpoints';
import { modelsEndpointsSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { validateJsonOutput } from '../../util/output-format';
import { renderResource } from '../../util/ai-gateway/output';

export default async function endpoints(client: Client, argv: string[]) {
  const telemetry = new AiGatewayModelsEndpointsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    modelsEndpointsSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { flags: opts, args } = parsedArgs;

  const model = args[0];
  telemetry.trackCliArgumentModel(model);
  telemetry.trackCliOptionFormat(opts['--format']);

  if (!model) {
    output.error(
      `Specify a model. Run ${getCommandName('ai-gateway models ls')} to see available models.`
    );
    return 1;
  }

  const formatResult = validateJsonOutput(opts);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }

  return renderResource<ModelWithEndpoints>(client, {
    asJson: formatResult.jsonOutput,
    spinnerText: `Fetching endpoints for ${model}`,
    fetch: () => listModelEndpoints(client, model),
    toJSON: data => data,
    isEmpty: data => (data?.endpoints ?? []).length === 0,
    emptyMessage: `No endpoints found for ${model}.`,
    header: data => `Endpoints for ${data.id}`,
    renderTable: data => printEndpointsTable(data.endpoints ?? []),
  });
}

const dash = () => chalk.gray('–');

const positive = (value: string | undefined): value is string =>
  value != null && Number(value) > 0;

const count = (value: number | undefined) =>
  value != null && value > 0 ? String(value) : dash();

// Input column: per-token when present, else fall back to the model's actual
// unit (image / per-second video / per-character speech / per-request). Full
// pricing stays in --format json.
function inputPrice(p: ModelEndpoint['pricing']) {
  if (positive(p?.prompt)) return p?.prompt;
  if (positive(p?.image)) return `${p?.image}/img`;
  const perSec = p?.video_duration_pricing
    ?.map(v => v.cost_per_second)
    .filter(positive)
    .sort((a, b) => Number(a) - Number(b))[0];
  if (perSec) return `${perSec}/s`;
  if (positive(p?.speech_input_character_cost))
    return `${p?.speech_input_character_cost}/char`;
  if (positive(p?.request)) return `${p?.request}/req`;
  return dash();
}

// Output column: per-token completion, else per-generated-image when present.
function outputPrice(p: ModelEndpoint['pricing']) {
  if (positive(p?.completion)) return p?.completion;
  if (positive(p?.image_output)) return `${p?.image_output}/img`;
  return dash();
}

function printEndpointsTable(list: ModelEndpoint[]) {
  // Keep the default view scannable on an 80-col terminal. Throughput, tags,
  // and the full pricing/metrics stay available via --format json.
  return `${table(
    [
      ['provider', 'context', 'input', 'output', 'p50 ttft', 'uptime'].map(
        header => chalk.gray(header)
      ),
      ...list.map(e => [
        e.provider_name,
        count(e.context_length),
        inputPrice(e.pricing),
        outputPrice(e.pricing),
        e.latency_last_1h?.p50 != null
          ? `${Math.round(e.latency_last_1h.p50)}ms`
          : dash(),
        e.uptime_last_1h != null ? `${e.uptime_last_1h.toFixed(1)}%` : dash(),
      ]),
    ],
    { align: ['l', 'r', 'r', 'r', 'r', 'r'], hsep: 3 }
  ).replace(/^/gm, '  ')}\n\n`;
}
