import chalk from 'chalk';
import ms from 'ms';
import stripAnsi from 'strip-ansi';
import type Client from '../../util/client';
import output from '../../output-manager';
import type { Drain, DrainDeliveryStats } from '../../util/drains/api';
import { formatAlignedLabel } from '../../util/output/print-aligned-label';
import { remoteText } from '../../util/output/remote-text';
import table from '../../util/output/table';

const SCHEMA_LABELS: Record<string, string> = {
  log: 'Logs',
  trace: 'Traces',
  analytics: 'Web Analytics',
  speed_insights: 'Speed Insights',
  ai_gateway: 'AI Gateway',
  audit_log: 'Audit Logs',
  connect: 'Connect',
};

const DISABLED_REASONS: Record<string, string> = {
  'feature-not-available': 'the feature is not available on the plan',
  'account-plan-downgrade': 'the plan was downgraded',
  'disabled-by-admin': 'an admin disabled it',
  'limits-exceeded': 'it exceeded its limits',
};

export function formatType(drain: Drain): string {
  const labels = Object.keys(drain.schemas ?? {}).map(
    schema => SCHEMA_LABELS[schema] ?? schema
  );
  return labels.length ? labels.join(', ') : '-';
}

export function getEndpoint(drain: Drain): string | undefined {
  const endpoint = drain.delivery?.endpoint;
  if (typeof endpoint === 'string') return endpoint;
  if (
    endpoint &&
    typeof endpoint === 'object' &&
    'traces' in endpoint &&
    typeof endpoint.traces === 'string'
  ) {
    return endpoint.traces;
  }
  return undefined;
}

export function formatProjects(drain: Drain): string {
  const ids = drain.projectIds;
  if (!ids?.length) return 'All';
  return ids.length === 1 ? ids[0] : `${ids.length} projects`;
}

/**
 * The drain's state as the dashboard names it: `Paused` when its owner
 * paused it, `Disabled` when Vercel did, `Errored`, or `Enabled`.
 */
export function formatState(drain: Drain): string {
  if (drain.status === 'disabled') {
    if (drain.disabledReason && drain.disabledReason !== 'disabled-by-owner') {
      const reason = DISABLED_REASONS[drain.disabledReason];
      return reason ? `Disabled (${reason})` : 'Disabled by Vercel';
    }
    return 'Paused';
  }
  if (drain.status === 'errored') return 'Errored';
  return 'Enabled';
}

/**
 * Share of delivered requests, rounded down so a failing drain never reads
 * as 100%. Matches the dashboard's drains list.
 */
export function formatDeliveredRate(stats: DrainDeliveryStats): string {
  const rate = (stats.attempts - stats.failures) / stats.attempts;
  if (rate === 1) return '100%';
  if (rate >= 0.999) return '>99.9%';
  if (rate >= 0.9) return `${Math.floor(rate * 1000) / 10}%`;
  return `${Math.floor(rate * 100)}%`;
}

/**
 * The status column of the drains list, with the dashboard's labels: a paused
 * or disabled drain says so, a drain with no deliveries in the window has no
 * data, and otherwise it's healthy or degraded with its delivered rate.
 */
export function getStatus(drain: Drain): {
  label: string;
  tone: 'success' | 'pending' | 'muted';
} {
  if (drain.status === 'disabled') {
    const paused =
      !drain.disabledReason || drain.disabledReason === 'disabled-by-owner';
    return { label: paused ? 'Paused' : 'Disabled', tone: 'muted' };
  }
  const stats = drain.deliveryStats;
  if (!stats || stats.state === 'unknown' || stats.attempts === 0) {
    return { label: 'No data', tone: 'muted' };
  }
  const delivered = `${formatDeliveredRate(stats)} delivered`;
  if (stats.state === 'failing') {
    return { label: `Degraded, ${delivered}`, tone: 'pending' };
  }
  return { label: `Healthy, ${delivered}`, tone: 'success' };
}

function formatAge(client: Client, timestamp: number): string {
  if (!client.stdout.isTTY) return new Date(timestamp).toISOString();
  const age = Date.now() - timestamp;
  if (age < 7 * 24 * 60 * 60 * 1000) return ms(Math.max(0, age));
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The drains table for stdout. The Status column only appears when the API
 * returned delivery stats. A non-TTY stdout gets tab-separated, uncolored
 * rows so `grep` and `cut` read it reliably.
 */
export function formatDrainsTable(
  client: Client,
  drains: Drain[],
  { withStatus }: { withStatus: boolean }
): string {
  const headers = ['ID', 'Name', 'Type', 'URL', 'Projects'];
  if (withStatus) headers.push('Status');
  headers.push('Age');

  const tty = Boolean(client.stdout.isTTY);
  const rows = drains.map(drain => {
    const row = [
      drain.id,
      remoteText(drain.name),
      formatType(drain),
      remoteText(getEndpoint(drain) ?? '-'),
      formatProjects(drain),
    ];
    if (withStatus) {
      const { label, tone } = getStatus(drain);
      row.push(tty ? output.formatStatus(label, tone) : label);
    }
    row.push(formatAge(client, drain.createdAt));
    return row;
  });

  if (!tty) {
    return [headers, ...rows]
      .map(row => row.map(cell => stripAnsi(cell)).join('\t'))
      .join('\n');
  }

  return table([headers.map(header => chalk.dim(header)), ...rows], {
    hsep: 3,
  })
    .split('\n')
    .map(line => `  ${line}`.trimEnd())
    .join('\n');
}

function formatFilter(drain: Drain) {
  const filter = drain.filterV2?.filter;
  if (!filter) return { sources: 'All', environments: 'All' };
  if (filter.type !== 'basic') {
    return { custom: remoteText(filter.text) };
  }
  return {
    sources: filter.log?.sources?.length
      ? filter.log.sources.join(', ')
      : 'All',
    environments: filter.deployment?.environments?.length
      ? filter.deployment.environments.join(', ')
      : 'All',
  };
}

function formatSampling(drain: Drain): string {
  if (!drain.sampling?.length) return '100%';
  return drain.sampling
    .map(rule => {
      const scope = [rule.env, rule.requestPath].filter(Boolean).join(' ');
      const rate = `${Math.round(rule.rate * 10000) / 100}%`;
      return scope ? `${rate} (${remoteText(scope)})` : rate;
    })
    .join(', ');
}

/** Aligned rows describing a drain, for `inspect` and receipts. */
export function formatDrainRows(drain: Drain, { full }: { full: boolean }) {
  const rows: Array<[string, string]> = [
    ['Drain ID', drain.id],
    ['Type', formatType(drain)],
    ['URL', remoteText(getEndpoint(drain) ?? '-')],
  ];
  const projects = drain.projectIds?.length
    ? drain.projectIds.join(', ')
    : 'All';
  rows.push(['Projects', projects]);
  if (!full) return rows;

  const delivery = drain.delivery;
  if (delivery?.encoding) rows.push(['Encoding', delivery.encoding]);
  const headers = Object.keys(delivery?.headers ?? {});
  if (headers.length) {
    rows.push(['Headers', headers.map(remoteText).join(', ')]);
  }
  rows.push(['Signed', delivery?.secret ? 'Yes' : 'No']);

  const filter = formatFilter(drain);
  if ('custom' in filter) {
    rows.push(['Filter', filter.custom ?? '']);
  } else {
    if (drain.schemas?.log) {
      rows.push(['Sources', filter.sources]);
      rows.push(['Environments', filter.environments]);
    }
  }
  rows.push(['Sampling', formatSampling(drain)]);
  rows.push(['Status', formatState(drain)]);
  if (drain.source?.kind === 'integration') {
    rows.push(['Managed By', 'Integration']);
  }
  rows.push(['Created', new Date(drain.createdAt).toISOString()]);
  return rows;
}

/** The detail view of `drains inspect`, for stdout. */
export function formatDrainDetails(drain: Drain): string {
  return [
    formatAlignedLabel('Drain', remoteText(drain.name)),
    ...formatDrainRows(drain, { full: true }).map(([label, value]) =>
      formatAlignedLabel(label, value)
    ),
  ].join('\n');
}

/** A receipt such as `✓ Created  acme-logs`, for stderr. */
export function printReceipt(
  verb: string,
  drain: Pick<Drain, 'id' | 'name'> & Partial<Drain>,
  { details }: { details: boolean }
): void {
  output.print(
    `${formatAlignedLabel(verb, remoteText(drain.name), { gutter: '✓' })}\n`
  );
  const rows: Array<[string, string]> = details
    ? formatDrainRows(drain as Drain, { full: false })
    : [['Drain ID', drain.id]];
  for (const [label, value] of rows) {
    output.print(`${formatAlignedLabel(label, value)}\n`);
  }
}
