import { writeFile } from 'node:fs/promises';
import type { Spec } from 'arg';
import chalk from 'chalk';
import table from '../../util/output/table';
import type Client from '../../util/client';
import type { CommandOption } from '../help';
import output from '../../output-manager';
import stamp from '../../util/output/stamp';
import { isAPIError } from '../../util/errors-ts';
import { canPrompt } from '../../util/can-prompt';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import {
  fetchLeaderboard,
  fetchLeaderboardCsv,
  filterTimeseries,
  latestDate,
  availableDates,
  LEADERBOARD_METRICS,
  LEADERBOARD_MODALITIES,
  type LeaderboardFormat,
  type LeaderboardMetric,
  type LeaderboardModality,
  type LeaderboardRankedResponse,
  type LeaderboardTimeseriesResponse,
} from '../../util/ai-gateway/leaderboard';

export interface TimeseriesTelemetry {
  trackCliOptionModality(value?: string): void;
  trackCliOptionMetric(value?: string): void;
  trackCliOptionDate(value?: string): void;
  trackCliOptionFormat(value?: string): void;
  trackCliOptionOut(value?: string): void;
}

export interface RankedTelemetry {
  trackCliOptionFormat(value?: string): void;
  trackCliOptionOut(value?: string): void;
}

interface LeaderboardFlags {
  '--format'?: string;
  '--out'?: string;
  '--modality'?: string;
  '--metric'?: string;
  '--date'?: string;
}

const dash = () => chalk.gray('–');

/**
 * Resolve the output representation. Explicit `--format` always wins; otherwise
 * a real terminal gets the pretty table and everything else (pipes, CI,
 * `--non-interactive`, `--out`) gets machine-readable JSON. CSV is opt-in only.
 */
function resolveFormat(
  client: Client,
  flags: LeaderboardFlags
): { format: LeaderboardFormat } | { error: string } {
  const raw = flags['--format'];
  const out = flags['--out'];

  if (raw !== undefined) {
    const format = raw.toLowerCase();
    if (format !== 'table' && format !== 'json' && format !== 'csv') {
      return {
        error: `Invalid format: "${raw}". Valid formats: table, json, csv`,
      };
    }
    if (format === 'table' && out !== undefined) {
      return {
        error:
          'Cannot write the table view to a file. Use --format json or --format csv with --out.',
      };
    }
    return { format };
  }

  if (out !== undefined) {
    return { format: 'json' };
  }

  const interactive = Boolean(client.stdout.isTTY) && !client.nonInteractive;
  return { format: interactive ? 'table' : 'json' };
}

/**
 * Case-insensitive enum parse that returns the canonical allowed value, so
 * camelCase members like `imageCount` match `--metric imagecount` (and any
 * other casing) instead of being rejected by a lowercased comparison.
 *
 * Exported for unit tests.
 */
export function parseEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  label: string
): { value: T | undefined } | { error: string } {
  if (value === undefined) {
    return { value: undefined };
  }
  const normalized = value.toLowerCase();
  const match = allowed.find(member => member.toLowerCase() === normalized);
  if (match === undefined) {
    return {
      error: `Invalid ${label}: "${value}". Valid values: ${allowed.join(', ')}`,
    };
  }
  return { value: match };
}

/** Fetch (json or raw csv) wrapped with the shared spinner + API-error flow. */
async function fetchWithSpinner<T>(
  fetch: () => Promise<T>,
  spinnerText: string
): Promise<{ data: T } | { exitCode: number }> {
  output.spinner(spinnerText);
  try {
    const data = await fetch();
    output.stopSpinner();
    return { data };
  } catch (err: unknown) {
    output.stopSpinner();
    if (isAPIError(err)) {
      output.error(err.message);
      return { exitCode: 1 };
    }
    throw err;
  }
}

async function writeToFile(
  client: Client,
  out: string,
  content: string,
  label: string
): Promise<number> {
  const writeStamp = stamp();
  try {
    await writeFile(out, content);
  } catch (err: unknown) {
    output.error(
      `Failed to write ${out}: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }
  output.log(`Wrote ${label} to ${chalk.bold(out)} ${writeStamp()}`);
  return 0;
}

/** Shared entry point for the `models` and `labs` (time-series) leaderboards. */
export async function runTimeseriesLeaderboard(
  client: Client,
  flags: LeaderboardFlags,
  telemetry: TimeseriesTelemetry,
  config: {
    dataset: 'models' | 'labs';
    /** Column header for the entity, e.g. `model` or `lab`. */
    entityLabel: string;
    label: string;
  }
): Promise<number> {
  telemetry.trackCliOptionModality(flags['--modality']);
  telemetry.trackCliOptionMetric(flags['--metric']);
  telemetry.trackCliOptionDate(flags['--date']);
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliOptionOut(flags['--out']);

  const formatResult = resolveFormat(client, flags);
  if ('error' in formatResult) {
    output.error(formatResult.error);
    return 1;
  }
  const { format } = formatResult;

  const modalityResult = parseEnum(
    flags['--modality'],
    LEADERBOARD_MODALITIES,
    'modality'
  );
  if ('error' in modalityResult) {
    output.error(modalityResult.error);
    return 1;
  }
  const metricResult = parseEnum(
    flags['--metric'],
    LEADERBOARD_METRICS,
    'metric'
  );
  if ('error' in metricResult) {
    output.error(metricResult.error);
    return 1;
  }

  let modality: LeaderboardModality | undefined = modalityResult.value;
  let metric: LeaderboardMetric | undefined = metricResult.value;

  // In an interactive terminal showing the table, let the user pick the
  // dimensions they didn't pass. Machine output (json/csv/--out) never prompts.
  if (format === 'table' && canPrompt(client)) {
    if (modality === undefined) {
      modality = await client.input.select<LeaderboardModality>({
        message: 'Modality',
        choices: LEADERBOARD_MODALITIES.map(value => ({ name: value, value })),
        default: 'all',
      });
    }
    if (metric === undefined) {
      metric = await client.input.select<LeaderboardMetric>({
        message: 'Metric',
        choices: LEADERBOARD_METRICS.map(value => ({ name: value, value })),
        default: 'requests',
      });
    }
  }

  const resolvedModality = modality ?? 'all';
  const resolvedMetric = metric ?? 'requests';

  // CSV is passed through verbatim; --modality still applies server-side.
  if (format === 'csv') {
    const result = await fetchWithSpinner(
      () =>
        fetchLeaderboardCsv(client, {
          dataset: config.dataset,
          modality: resolvedModality,
        }),
      `Fetching ${config.label}`
    );
    if ('exitCode' in result) return result.exitCode;
    if (flags['--out'] !== undefined) {
      return writeToFile(client, flags['--out'], result.data, config.label);
    }
    client.stdout.write(result.data);
    return 0;
  }

  const result = await fetchWithSpinner(
    () =>
      fetchLeaderboard(client, {
        dataset: config.dataset,
        modality: resolvedModality,
      }),
    `Fetching ${config.label}`
  );
  if ('exitCode' in result) return result.exitCode;
  const data = result.data;

  if (format === 'json') {
    const content = `${JSON.stringify(data, null, 2)}\n`;
    if (flags['--out'] !== undefined) {
      return writeToFile(client, flags['--out'], content, config.label);
    }
    client.stdout.write(content);
    return 0;
  }

  // Table view: collapse to one metric on one day, ranked by share.
  return renderTimeseriesTable(client, data, {
    metric: resolvedMetric,
    modality: resolvedModality,
    date: flags['--date'],
    entityLabel: config.entityLabel,
    label: config.label,
  });
}

function renderTimeseriesTable(
  client: Client,
  data: LeaderboardTimeseriesResponse,
  options: {
    metric: LeaderboardMetric;
    modality: LeaderboardModality;
    date?: string;
    entityLabel: string;
    label: string;
  }
): number {
  const rows = data.rows ?? [];

  if (options.date !== undefined && !rows.some(r => r.date === options.date)) {
    const dates = availableDates(rows);
    output.error(
      `No data for ${options.date}.${dates.length ? ` Available dates: ${dates.slice(0, 5).join(', ')}${dates.length > 5 ? ', …' : ''}` : ''}`
    );
    return 1;
  }

  const filtered = filterTimeseries(rows, {
    metric: options.metric,
    date: options.date,
  });

  if (filtered.length === 0) {
    output.log(`No ${options.label} data for ${options.metric}.`);
    return 0;
  }

  const day = options.date ?? latestDate(rows);
  output.log(
    `${options.label} · ${chalk.bold(options.metric)} · ${options.modality} · ${day}`
  );
  client.stdout.write(
    `${table(
      [
        ['#', options.entityLabel, 'share'].map(header => chalk.gray(header)),
        ...filtered.map((row, index) => [
          String(index + 1),
          row.name,
          `${row.share_percent.toFixed(2)}%`,
        ]),
      ],
      { align: ['r', 'l', 'r'], hsep: 3 }
    ).replace(/^/gm, '  ')}\n`
  );
  printLicense();
  return 0;
}

/** Shared entry point for the `apps` and `providers` (ranked) leaderboards. */
export async function runRankedLeaderboard(
  client: Client,
  flags: LeaderboardFlags,
  telemetry: RankedTelemetry,
  config: { dataset: 'apps' | 'providers'; label: string }
): Promise<number> {
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliOptionOut(flags['--out']);

  const formatResult = resolveFormat(client, flags);
  if ('error' in formatResult) {
    output.error(formatResult.error);
    return 1;
  }
  const { format } = formatResult;

  if (format === 'csv') {
    const result = await fetchWithSpinner(
      () => fetchLeaderboardCsv(client, { dataset: config.dataset }),
      `Fetching ${config.label}`
    );
    if ('exitCode' in result) return result.exitCode;
    if (flags['--out'] !== undefined) {
      return writeToFile(client, flags['--out'], result.data, config.label);
    }
    client.stdout.write(result.data);
    return 0;
  }

  const result = await fetchWithSpinner(
    () => fetchLeaderboard(client, { dataset: config.dataset }),
    `Fetching ${config.label}`
  );
  if ('exitCode' in result) return result.exitCode;
  const data = result.data;

  if (format === 'json') {
    const content = `${JSON.stringify(data, null, 2)}\n`;
    if (flags['--out'] !== undefined) {
      return writeToFile(client, flags['--out'], content, config.label);
    }
    client.stdout.write(content);
    return 0;
  }

  return renderRankedTable(client, data, config.label);
}

function renderRankedTable(
  client: Client,
  data: LeaderboardRankedResponse,
  label: string
): number {
  const rows = data.rows ?? [];
  if (rows.length === 0) {
    output.log(`No ${label} data.`);
    return 0;
  }

  const lsStamp = stamp();
  const rankedBy = rows[0]?.ranked_by;
  output.log(
    `${label}${rankedBy ? ` · ${chalk.bold(rankedBy)}` : ''} ${lsStamp()}`
  );
  client.stdout.write(
    `${table(
      [
        ['#', 'name', 'description'].map(header => chalk.gray(header)),
        ...rows.map(row => [
          String(row.rank),
          row.name,
          row.description ? row.description : dash(),
        ]),
      ],
      { align: ['r', 'l', 'l'], hsep: 3 }
    ).replace(/^/gm, '  ')}\n`
  );
  printLicense();
  return 0;
}

function printLicense() {
  output.log(
    chalk.gray('Source: AI Gateway Leaderboard data, licensed under CC BY 4.0.')
  );
}

type LeaderboardVariant =
  | ({ kind: 'timeseries'; telemetry: TimeseriesTelemetry } & {
      dataset: 'models' | 'labs';
      /** Column header for the entity, e.g. `model` or `lab`. */
      entityLabel: string;
      label: string;
    })
  | ({ kind: 'ranked'; telemetry: RankedTelemetry } & {
      dataset: 'apps' | 'providers';
      label: string;
    });

/**
 * Single entry point for every leaderboard subcommand: parses argv against the
 * subcommand's flag spec (with the shared error handling) and dispatches to
 * the time-series or ranked engine, so the per-subcommand files stay
 * declarative.
 */
export async function runLeaderboardSubcommand(
  client: Client,
  argv: string[],
  subcommand: { options: readonly CommandOption[] },
  variant: LeaderboardVariant
): Promise<number> {
  let parsedArgs;
  // Over a broad `readonly CommandOption[]` the mapped spec type widens past
  // what `arg` accepts; the runtime value is the same spec every subcommand
  // builds for itself today.
  const flagsSpecification = getFlagsSpecification(subcommand.options) as Spec;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  // The generic spec widens the parsed flag types; every leaderboard
  // subcommand declares (a subset of) these flags.
  const flags = parsedArgs.flags as LeaderboardFlags;

  if (variant.kind === 'timeseries') {
    return runTimeseriesLeaderboard(client, flags, variant.telemetry, {
      dataset: variant.dataset,
      entityLabel: variant.entityLabel,
      label: variant.label,
    });
  }
  return runRankedLeaderboard(client, flags, variant.telemetry, {
    dataset: variant.dataset,
    label: variant.label,
  });
}
