import format from 'date-fns/format';
import type Client from '../../util/client';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import formatDate from '../../util/format-date';
import {
  formatAlignedLabel,
  printAlignedLabel,
} from '../../util/output/print-aligned-label';
import { resolveTimeRange } from '../../util/time-utils';
import { validateTimeOrder } from '../../util/command-validation';
import { formatMetricValue, generateSparkline } from '../metrics/text-output';
import { OBSERVABILITY_METRICS_PATH } from '../metrics/schema-api';
import type {
  CanonicalMetricsQueryRequest,
  CanonicalMetricsQueryResponse,
} from '../metrics/types';
import cmd from '../../util/output/cmd';
import { isAPIError } from '../../util/errors-ts';
import {
  instancesInspectSubcommand,
  instancesRestartSubcommand,
} from './command';
import * as api from './api';

// [output, label, unit, aggregation] for each usage row.
const ROWS = [
  ['cpu', 'CPU', 'percent', 'avg'],
  ['cpuTime', 'CPU time', 'milliseconds', 'sum'],
  ['memory', 'Memory (avg)', 'bytes', 'avg'],
  ['memoryPeak', 'Memory (peak)', 'bytes', 'max'],
  ['transferIn', 'Data transfer in', 'bytes', 'sum'],
  ['transferOut', 'Data transfer out', 'bytes', 'sum'],
] as const;

const metric = (name: string, aggregation: string) => ({
  metric: `vercel.daemon.${name}`,
  aggregation,
});

/** Queries the usage of one instance in buckets of at least 5 minutes. */
function fetchMetrics(
  client: Client,
  project: { id: string; accountId: string },
  instanceId: string,
  { startTime, endTime }: { startTime: Date; endTime: Date }
) {
  const start = Math.floor(startTime.getTime() / 1000) * 1000;
  const end = Math.floor(endTime.getTime() / 1000) * 1000;
  const minutes = (end - start) / 60_000;
  const body: CanonicalMetricsQueryRequest & { formulas: object } = {
    scope: { ownerId: project.accountId, projectIds: [project.id] },
    timeRange: {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    },
    bucketSeconds: Math.max(1, Math.ceil(minutes / 300)) * 300,
    filter: `instanceId:${instanceId}`,
    metrics: {
      cpuTime: metric('cpu_time_ms', 'sum'),
      provisionedCpu: metric('provisioned_cpu_time_ms', 'sum'),
      memory: metric('memory_used_bytes', 'avg'),
      memoryPeak: metric('memory_peak_bytes', 'max'),
      transferIn: metric('data_transfer_in_bytes', 'sum'),
      transferOut: metric('data_transfer_out_bytes', 'sum'),
    },
    formulas: { cpu: 'cpuTime / provisionedCpu * 100' },
    outputs: ROWS.map(([key]) => key),
  };
  return client.fetch<CanonicalMetricsQueryResponse>(
    OBSERVABILITY_METRICS_PATH,
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      accountId: project.accountId,
      bailOn429: true,
    }
  );
}

function formatMetrics(response: CanonicalMetricsQueryResponse) {
  const summary = response.summary[0]?.values ?? {};
  const rows = ROWS.map(([key, label, unit, aggregation]) => [
    label,
    typeof summary[key] === 'number'
      ? formatMetricValue(summary[key], unit, aggregation)
      : '-',
    generateSparkline((response.series ?? []).map(p => p.values[key] ?? null)),
  ]);
  return api.formatTable(['Metric', 'Value', 'Trend'], rows);
}

/** `vercel daemons instances inspect <instance>` */
export async function instancesInspect(client: Client, argv: string[]) {
  const USAGE = 'instances inspect <instance>';
  const options = instancesInspectSubcommand.options;
  const parsed = api.parse(client, argv, options, USAGE);
  if (typeof parsed === 'number') return parsed;
  const { args, flags, asJson, telemetry } = parsed;
  telemetry.trackCliArgumentInstance(args[0]);
  const instanceId = api.instanceIdArg(client, args, USAGE);
  if (typeof instanceId === 'number') return instanceId;
  let range: { startTime: Date; endTime: Date };
  try {
    range = resolveTimeRange(flags['--since'], flags['--until']);
  } catch (err) {
    return api.usageError(client, (err as Error).message, USAGE);
  }
  const order = validateTimeOrder(range.startTime, range.endTime);
  if (!order.valid) return api.usageError(client, order.message, USAGE);
  if (
    Math.floor(range.startTime.getTime() / 1000) ===
    Math.floor(range.endTime.getTime() / 1000)
  ) {
    return api.usageError(
      client,
      'The metrics time range must span at least one whole second.',
      USAGE
    );
  }

  const link = await api.resolveProject(client, flags['--project']);
  if (typeof link === 'number') return link;

  try {
    if (!asJson) output.spinner(`Fetching instance ${instanceId}`);
    const instance = await api.findInstance(client, link, instanceId);
    if (typeof instance === 'number') return instance;
    // Metrics are best effort: the details are useful without them.
    const metrics = await fetchMetrics(
      client,
      link.project,
      instanceId,
      range
    ).catch((err: unknown) => output.debug(err));
    output.stopSpinner();
    const warning = "Couldn't load the usage metrics of this instance.";
    if (asJson) {
      const reason = AGENT_REASON.METRICS_UNAVAILABLE;
      const warnings = metrics ? undefined : [{ reason, message: warning }];
      return api.printJson(client, {
        instance,
        metrics: metrics ?? null,
        warnings,
      });
    }

    printAlignedLabel('Project', link.target);
    const details: Array<[string, string | undefined]> = [
      ['Instance ID', instance.id],
      ['Daemon', instance.daemon],
      ['Region', instance.region],
      ['Status', api.formatStatus(api.formatInstanceState(instance))],
      ['Started', formatDate(instance.startedAt)],
      [
        'Last checked',
        instance.lastCheckedAt && formatDate(instance.lastCheckedAt),
      ],
      ['Memory', instance.memoryMiB ? `${instance.memoryMiB} MiB` : undefined],
      ['Image', instance.image],
    ];
    const lines = details.flatMap(([label, value]) =>
      value ? [formatAlignedLabel(label, value)] : []
    );
    client.stdout.write(`\n${lines.join('\n')}\n\n`);
    if (!metrics) {
      output.warning(warning);
      return 0;
    }
    const time = (date: Date) => format(date, 'YYYY-MM-DD HH:mm');
    const period = `${time(range.startTime)} to ${time(range.endTime)}`;
    client.stdout.write(
      `  Usage from ${period}\n\n${formatMetrics(metrics)}\n\n`
    );
    return 0;
  } catch (err) {
    output.stopSpinner();
    return api.reportError(client, err);
  }
}

/** `vercel daemons instances restart <instance>` */
export async function instancesRestart(client: Client, argv: string[]) {
  const USAGE = 'instances restart <instance>';
  const options = instancesRestartSubcommand.options;
  const parsed = api.parse(client, argv, options, USAGE);
  if (typeof parsed === 'number') return parsed;
  const { args, flags, asJson, telemetry } = parsed;
  telemetry.trackCliArgumentInstance(args[0]);
  const instanceId = api.instanceIdArg(client, args, USAGE);
  if (typeof instanceId === 'number') return instanceId;

  const link = await api.resolveProject(client, flags['--project']);
  if (typeof link === 'number') return link;
  const command = `instances inspect ${instanceId}`;
  const inspect = { command, when: 'Check the instance' };

  try {
    if (!asJson) output.spinner(`Restarting instance ${instanceId}`);
    const instance = await api.findInstance(client, link, instanceId);
    if (typeof instance === 'number') return instance;
    const path = `${api.daemonsPath(link.project, instance.daemon)}/instances`;
    try {
      await client.fetch(`${path}/${instanceId}/restart`, {
        method: 'POST',
        accountId: link.project.accountId,
        retry: { retries: 0 }, // Never repeat a restart that may have landed.
      });
    } catch (err) {
      if (isAPIError(err)) throw err;
      output.debug(err);
      const message = "Couldn't confirm whether the restart was accepted.";
      const reason = AGENT_REASON.UNKNOWN_OUTCOME;
      return api.failure(client, reason, message, inspect);
    }
    output.stopSpinner();
    const next = api.daemonsCommand(client, command);
    if (asJson) {
      return api.printJson(client, {
        instance: { id: instanceId, daemon: instance.daemon },
        outcome: 'accepted',
        next: [{ command: next }],
      });
    }
    printAlignedLabel('Accepted', `restart of ${instanceId}`);
    output.print(
      `\n  The instance is restarting. Check its status:\n    ${cmd(next)}\n`
    );
    if (!client.stdout.isTTY) client.stdout.write(`${instanceId}\n`);
    return 0;
  } catch (err) {
    if (isAPIError(err) && err.status === 409) {
      const message = `Instance ${instanceId} is still starting. Try again when it is running.`;
      return api.failure(client, AGENT_REASON.CONFLICT, message, inspect);
    }
    output.stopSpinner();
    return api.reportError(client, err);
  }
}
