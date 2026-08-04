import chalk from 'chalk';
import table from '../../util/output/table';
import type { AiGatewayLog, AiGatewayProviderAttempt } from './logs-api';

const dash = () => chalk.gray('–');

export function renderLogsTable(logs: AiGatewayLog[]): string {
  return `${table(
    [
      [
        'time',
        'status',
        'model',
        'provider',
        'cost',
        'tokens',
        'duration',
        'region',
        'generation id',
      ].map(header => chalk.gray(header)),
      ...logs.map(log => [
        formatTimestamp(log.timestamp),
        log.status === null ? dash() : String(log.status),
        safeCell(log.model),
        safeCell(log.provider),
        formatCost(log.cost.total),
        formatCount(log.tokens.total),
        formatDuration(log.durationMs),
        safeCell(log.region?.toUpperCase() ?? null),
        log.generationId,
      ]),
    ],
    { align: ['l', 'r', 'l', 'l', 'r', 'r', 'r', 'l', 'l'], hsep: 3 }
  ).replace(/^/gm, '  ')}\n`;
}

export function renderLogDetails(log: AiGatewayLog): string {
  return `${table(
    [
      ['Generation ID', log.generationId],
      ['Timestamp', log.timestamp],
      ['Status', log.status === null ? dash() : String(log.status)],
      ['Model', safeCell(log.model)],
      ['Provider', safeCell(log.provider)],
      ['Region', safeCell(log.region?.toUpperCase() ?? null)],
      ['Project ID', safeCell(log.projectId)],
      ['Environment', safeCell(log.environment)],
      ['Total cost', formatCost(log.cost.total)],
      ['Inference cost', formatCost(log.cost.inference)],
      ['Duration', formatDuration(log.durationMs)],
      ['Time to first token', formatDuration(log.timeToFirstTokenMs)],
      ['Input tokens', formatCount(log.tokens.input)],
      ['Cached input tokens', formatCount(log.tokens.cachedInput)],
      ['Cache creation tokens', formatCount(log.tokens.cacheCreationInput)],
      ['Output tokens', formatCount(log.tokens.output)],
      ['Reasoning tokens', formatCount(log.tokens.reasoning)],
      ['Total tokens', formatCount(log.tokens.total)],
    ].map(([label, value]) => [chalk.bold(label), value]),
    { hsep: 3 }
  ).replace(/^/gm, '  ')}\n`;
}

export function renderAttemptsTable(
  attempts: AiGatewayProviderAttempt[]
): string {
  return `${table(
    [
      [
        'result',
        'model',
        'provider',
        'credential',
        'status',
        'duration',
        'error',
      ].map(header => chalk.gray(header)),
      ...attempts.map(attempt => [
        attempt.success ? chalk.green('success') : chalk.red('failed'),
        safeCell(attempt.model),
        safeCell(attempt.provider),
        attempt.credentialType,
        attempt.statusCode === null ? dash() : String(attempt.statusCode),
        formatDuration(attempt.durationMs),
        safeCell(attempt.error, 80),
      ]),
    ],
    { align: ['l', 'l', 'l', 'l', 'r', 'r', 'l'], hsep: 3 }
  ).replace(/^/gm, '  ')}\n`;
}

function formatTimestamp(value: string): string {
  return value.replace('T', ' ').replace('.000Z', 'Z');
}

function formatCost(value: number | null): string {
  if (value === null) return dash();
  return `$${value.toFixed(value < 0.01 ? 6 : 4)}`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDuration(value: number | null): string {
  if (value === null) return dash();
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}s`;
}

function safeCell(value: string | null, maxLength = 60): string {
  if (!value) return dash();
  const normalized = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}
