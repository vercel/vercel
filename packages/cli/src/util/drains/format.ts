import chalk from 'chalk';
import ms from 'ms';
import table from '../output/table';
import type { Drain, DrainDelivery } from './types';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const HIDDEN = chalk.gray.italic('Hidden');

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function formatDataType(drain: Drain): string {
  const [name] = Object.keys(drain.schemas ?? {});
  return name ?? '—';
}

export function formatDestination(drain: Drain): string {
  const { delivery } = drain;
  switch (delivery.type) {
    case 'http':
      return hostOf(delivery.endpoint);
    case 'otlphttp':
      return hostOf(delivery.endpoint.traces);
    case 'clickhouse':
      return `${hostOf(delivery.endpoint)} (${delivery.table})`;
    case 's3':
      return `S3 ${delivery.region}`;
    case 'internal':
      return 'internal';
  }
}

export function formatStatus(drain: Drain): string {
  const status = drain.status ?? 'enabled';
  if (status === 'enabled') return `${chalk.green('● ')}Active`;
  if (status === 'errored') return `${chalk.red('● ')}Errored`;

  switch (drain.disabledReason) {
    case 'account-plan-downgrade':
      return chalk.gray('Paused (plan downgraded)');
    case 'feature-not-available':
    case 'disabled-by-admin':
      return chalk.gray('Disabled by Vercel');
    default:
      return chalk.gray('Paused');
  }
}

export function formatDrainsTable(drains: Drain[]): string {
  return `${table(
    [
      ['id', 'name', 'type', 'status', 'dest', 'age'].map(header =>
        chalk.dim(header)
      ),
      ...drains.map(drain => [
        drain.id,
        drain.name,
        formatDataType(drain),
        formatStatus(drain),
        formatDestination(drain),
        chalk.gray(ms(Date.now() - drain.createdAt)),
      ]),
    ],
    { align: ['l', 'l', 'l', 'l', 'l', 'r'], hsep: 2 }
  ).replace(/^(.*)/gm, '  $1')}\n`;
}

export function formatDrainDetails(drain: Drain): string {
  const rows: string[][] = [
    ['Name', drain.name],
    ['Data type', formatDataTypeDetail(drain)],
    ['Status', formatStatus(drain)],
    ['Destination', formatDestinationDetail(drain)],
    ['Delivery', formatDelivery(drain.delivery)],
  ];

  const secret = 'secret' in drain.delivery ? drain.delivery.secret : undefined;
  if (secret !== undefined) {
    rows.push(['Secret', HIDDEN]);
  }

  const headers =
    'headers' in drain.delivery ? drain.delivery.headers : undefined;
  const headerKeys = headers ? Object.keys(headers) : [];
  if (headerKeys.length > 0) {
    const width = Math.max(...headerKeys.map(key => key.length));
    headerKeys.forEach((key, idx) => {
      rows.push([
        idx === 0 ? 'Headers' : '',
        `${key.padEnd(width)}  ${HIDDEN}`,
      ]);
    });
  }

  rows.push(['Projects', formatProjects(drain)]);

  if (drain.sampling && drain.sampling.length > 0) {
    drain.sampling.forEach((rule, idx) => {
      const env = rule.env ?? 'all';
      const rate = `${Math.round(rule.rate * 100)}%`;
      const path = rule.requestPath ?? '(all paths)';
      rows.push([idx === 0 ? 'Sampling' : '', `${env}  ${rate}  ${path}`]);
    });
  }

  rows.push(['Source', drain.source.kind]);
  rows.push(['Created', formatTimestamp(drain.createdAt)]);
  rows.push(['Updated', formatTimestamp(drain.updatedAt)]);

  return `${table(rows, { align: ['l', 'l'], hsep: 2 }).replace(/^(.*)/gm, '  $1')}\n`;
}

export function redactDrainForJson(drain: Drain): Drain {
  const clone = structuredClone(drain);
  const delivery = clone.delivery as {
    secret?: unknown;
    headers?: Record<string, unknown>;
  };
  if (typeof delivery.secret === 'string') {
    delete delivery.secret;
  }
  if (delivery.headers) {
    for (const key of Object.keys(delivery.headers)) {
      delivery.headers[key] = null;
    }
  }
  return clone;
}

function formatDataTypeDetail(drain: Drain): string {
  const [entry] = Object.entries(drain.schemas ?? {});
  if (!entry) return '—';
  const [name, schema] = entry;
  return schema?.version ? `${name} (${schema.version})` : name;
}

function formatDestinationDetail(drain: Drain): string {
  const { delivery } = drain;
  switch (delivery.type) {
    case 'http':
    case 'clickhouse':
      return delivery.endpoint;
    case 'otlphttp':
      return delivery.endpoint.traces;
    case 's3':
      return `S3 ${delivery.region}`;
    case 'internal':
      return 'internal';
  }
}

function formatDelivery(delivery: DrainDelivery): string {
  switch (delivery.type) {
    case 'http':
      return [delivery.type, delivery.encoding, delivery.compression]
        .filter(Boolean)
        .join(' · ');
    case 'otlphttp':
      return [delivery.type, delivery.encoding].join(' · ');
    case 's3':
      return [delivery.type, delivery.encoding, delivery.compression]
        .filter(Boolean)
        .join(' · ');
    case 'clickhouse':
    case 'internal':
      return delivery.type;
  }
}

function formatProjects(drain: Drain): string {
  const ids = drain.projectIds ?? drain.projectAccess?.projectIds;
  return ids && ids.length > 0 ? ids.join(', ') : 'all';
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const label = `${MONTHS[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
  return `${label} (${ms(Date.now() - timestamp)} ago)`;
}
