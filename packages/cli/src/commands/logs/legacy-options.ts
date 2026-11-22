import { getCommandName } from '../../util/pkg-name';

/**
 * Options removed from `vercel logs`. They are parsed, never documented, so a
 * legacy invocation gets its replacement instead of a generic parser error.
 */
export const legacyLogsOptions = [
  { name: 'search', shorthand: null, type: String, deprecated: true },
  { name: 'branch', shorthand: 'b', type: String, deprecated: true },
  { name: 'no-branch', shorthand: null, type: Boolean, deprecated: true },
  { name: 'no-follow', shorthand: null, type: Boolean, deprecated: true },
  { name: 'request-id', shorthand: null, type: String, deprecated: true },
  { name: 'level', shorthand: null, type: [String], deprecated: true },
  { name: 'source', shorthand: null, type: [String], deprecated: true },
  { name: 'status-code', shorthand: null, type: String, deprecated: true },
  { name: 'expand', shorthand: 'x', type: Boolean, deprecated: true },
] as const;

type LegacyFlags = {
  '--search'?: string;
  '--branch'?: string;
  '--no-branch'?: boolean;
  '--no-follow'?: boolean;
  '--request-id'?: string;
  '--level'?: string[];
  '--source'?: string[];
  '--status-code'?: string;
  '--expand'?: boolean;
};

// Values that can be embedded in a single-quoted shell example as-is.
const SIMPLE_VALUE = /^[\w.\-:/]+$/;

function filterCommand(filter: string, source?: 'requests'): string {
  return getCommandName(
    `logs${source ? ` ${source}` : ''} --query '${filter}'`
  );
}

function alternatives(field: string, values: string[]): string {
  return values.length === 1
    ? `${field}:${values[0]}`
    : `${field}:(${values.join(' OR ')})`;
}

function statusFilter(value: string): string {
  const statusClass = /^([1-5])xx$/i.exec(value);
  if (statusClass) {
    const base = Number(statusClass[1]) * 100;
    return `httpStatus >= ${base} AND httpStatus < ${base + 100}`;
  }
  return /^\d{3}$/.test(value) ? `httpStatus:${value}` : 'httpStatus:500';
}

/**
 * The old `--source` values don't match the API's `source` values, so they
 * are not copied into the suggested query.
 */
function sourceReplacement(values: string[]): string {
  const normalized = values.map(value => value.trim().toLowerCase());
  if (normalized.length > 0 && normalized.every(v => v === 'static')) {
    return `--source was removed. Static and CDN traffic is in ${getCommandName(
      'logs requests'
    )}.`;
  }
  if (normalized.length > 0 && normalized.every(v => v === 'serverless')) {
    return `--source was removed. Use ${filterCommand('source:function')}.`;
  }
  return (
    `--source was removed. Use ${filterCommand('source:<value>')}.\n` +
    `See ${getCommandName('logs runtime --help')} for filter fields and examples.`
  );
}

/** Names of the removed options in `flags`, without their values. */
export function usedLegacyOptions(flags: LegacyFlags): string[] {
  return legacyLogsOptions
    .map(option => option.name)
    .filter(name => flags[`--${name}` as keyof LegacyFlags] !== undefined);
}

/** Returns an error for the first removed option in `flags`, if any. */
export function getLegacyOptionError(flags: LegacyFlags): string | undefined {
  if (flags['--search'] !== undefined) {
    return (
      '--search was replaced by --query, which uses a new KQL-inspired syntax.\n' +
      `See ${getCommandName('logs runtime --help')} or ${getCommandName(
        'logs requests --help'
      )} for filter fields and examples.`
    );
  }

  if (flags['--branch'] !== undefined) {
    return '--branch is no longer supported. Remove it from the command.';
  }

  const requestId = flags['--request-id'];
  if (requestId !== undefined) {
    const value = SIMPLE_VALUE.test(requestId) ? requestId : '<request-id>';
    return `--request-id was removed. Use ${filterCommand(`requestId:"${value}"`)}.`;
  }

  const levels = flags['--level'];
  if (levels !== undefined) {
    const values = levels.every(level => SIMPLE_VALUE.test(level))
      ? levels
      : ['error'];
    return `--level was removed. Use ${filterCommand(alternatives('level', values))}.`;
  }

  const sources = flags['--source'];
  if (sources !== undefined) {
    return sourceReplacement(sources);
  }

  const statusCode = flags['--status-code'];
  if (statusCode !== undefined) {
    return `--status-code was removed. Use ${filterCommand(
      statusFilter(statusCode.trim()),
      'requests'
    )}.`;
  }

  if (flags['--expand'] !== undefined) {
    return '--expand was removed. Full runtime messages are shown by default; remove the option.';
  }

  for (const flag of ['--no-branch', '--no-follow'] as const) {
    if (flags[flag] !== undefined) {
      return `${flag} was removed and has no effect. Remove it from the command.`;
    }
  }

  return undefined;
}
