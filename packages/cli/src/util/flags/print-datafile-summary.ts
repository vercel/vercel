import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import formatTable from '../format-table';
import output from '../../output-manager';
import { truncateEnd } from '../output/truncate';
import { formatVariantValue } from './resolve-variant';
import type { FlagVariantValue } from './types';

// The packed datafile format produced by `pack()` in the feature flags API.
// Variants and outcomes reference variants by index.

type PackedOutcome =
  | number
  | { type: 'split'; weights: number[]; defaultVariant: number }
  | {
      type: 'rollout';
      rollFromVariant: number;
      rollToVariant: number;
      defaultVariant: number;
    }
  | { type: 'experiment' };

type PackedTargetList = Record<string, Record<string, unknown[]>>;

/**
 * A number means the flag is disabled in the environment and always serves
 * that variant.
 */
type PackedEnvironmentConfig =
  | number
  | { reuse: string }
  | {
      fallthrough: PackedOutcome;
      rules?: { outcome: PackedOutcome }[];
      targets?: PackedTargetList[];
    };

interface PackedFlagDefinition {
  environments: Record<string, PackedEnvironmentConfig>;
  variants: FlagVariantValue[];
  variantIds?: string[];
  experiment?: { weights: number[]; defaultVariant: number };
}

/** Lists up to this many boolean or number variants in the Serves column. */
const MAX_LISTED_VARIANTS = 3;
const MAX_VARIANT_LENGTH = 30;

export interface PackedDatafile {
  definitions: Record<string, PackedFlagDefinition>;
  segments?: Record<string, unknown>;
  environment?: string;
  projectId?: string;
  revision?: number;
  configUpdatedAt?: number;
}

export function isPackedDatafile(data: unknown): data is PackedDatafile {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { definitions?: unknown }).definitions === 'object' &&
    (data as { definitions?: unknown }).definitions !== null
  );
}

interface DatafileSummaryOptions {
  /** `org/project`, when known. SDK key requests only know the project ID. */
  projectLabel?: string;
  /** The requested environment, used when the datafile does not name one. */
  environment?: string;
  /** The command that prints the full datafile as JSON. */
  jsonCommand: string;
}

export function printDatafileSummary(
  datafile: PackedDatafile,
  { projectLabel, environment, jsonCommand }: DatafileSummaryOptions
) {
  const envName = datafile.environment ?? environment;
  const slugs = Object.keys(datafile.definitions).sort();
  const segmentCount = Object.keys(datafile.segments ?? {}).length;

  const source = [
    envName ? `the ${envName} datafile` : 'the datafile',
    projectLabel ?? datafile.projectId,
  ]
    .filter(Boolean)
    .join(' for ');
  const details = [
    datafile.revision !== undefined ? `revision ${datafile.revision}` : null,
    datafile.configUpdatedAt !== undefined
      ? `updated ${ms(Math.max(0, Date.now() - datafile.configUpdatedAt))} ago`
      : null,
  ].filter(Boolean);
  const detailsSuffix =
    details.length > 0 ? ` ${chalk.gray(`(${details.join(', ')})`)}` : '';
  const segmentsSuffix =
    segmentCount > 0 ? ` and ${plural('segment', segmentCount, true)}` : '';

  if (slugs.length === 0) {
    output.log(`No feature flags in ${source}${detailsSuffix}`);
  } else {
    output.log(
      `${plural('feature flag', slugs.length, true)}${segmentsSuffix} in ${source}${detailsSuffix}`
    );

    const rows = slugs.map(slug =>
      formatFlagRow(slug, datafile.definitions[slug], envName)
    );
    const table = formatTable(
      ['Name', 'Serves', 'Rules', 'Targets', 'Reuses'],
      ['l', 'l', 'r', 'r', 'l'],
      [{ name: '', rows }]
    );
    output.print(`\n${table}\n`);
  }

  output.log(`To see the full datafile including rules, run ${jsonCommand}`);
}

function formatFlagRow(
  slug: string,
  definition: PackedFlagDefinition,
  envName: string | undefined
): string[] {
  const { config, reusedEnvironment } = resolveEnvironmentConfig(
    definition,
    envName
  );
  const reuses = reusedEnvironment ?? '';

  if (
    config === undefined ||
    (typeof config === 'object' && 'reuse' in config)
  ) {
    return [chalk.bold(slug), chalk.gray('unknown'), '', '', reuses];
  }

  // Targeting is off, so rules and targets are not part of the datafile.
  // Leaving their columns blank tells this apart from targeting with none.
  if (typeof config === 'number') {
    return [
      chalk.bold(slug),
      formatServes(definition, new Set([config])),
      '',
      '',
      reuses,
    ];
  }

  return [
    chalk.bold(slug),
    formatServes(definition, collectServedVariants(definition, config)),
    String(config.rules?.length ?? 0),
    String(countTargets(config.targets)),
    reuses,
  ];
}

/**
 * Follows `reuse` references to the configuration the SDK evaluates.
 * Returns the first environment that was reused, if any.
 */
function resolveEnvironmentConfig(
  definition: PackedFlagDefinition,
  envName: string | undefined
): {
  config: PackedEnvironmentConfig | undefined;
  reusedEnvironment?: string;
} {
  const environments = definition.environments ?? {};
  const name = envName ?? Object.keys(environments)[0];
  let config = name !== undefined ? environments[name] : undefined;
  let reusedEnvironment: string | undefined;
  const visited = new Set([name]);

  while (typeof config === 'object' && config !== null && 'reuse' in config) {
    reusedEnvironment ??= config.reuse;
    if (visited.has(config.reuse)) {
      return { config: undefined, reusedEnvironment };
    }
    visited.add(config.reuse);
    config = environments[config.reuse];
  }

  return { config, reusedEnvironment };
}

/**
 * Collects the indexes of every variant the configuration can serve: the
 * fallthrough, rule outcomes, and variants with targets. Splits, rollouts,
 * and experiments contribute their weighted variants and their fallback.
 */
function collectServedVariants(
  definition: PackedFlagDefinition,
  config: Exclude<PackedEnvironmentConfig, number | { reuse: string }>
): Set<number> {
  const served = new Set<number>();
  const addOutcome = (outcome: PackedOutcome | undefined) => {
    if (typeof outcome === 'number') {
      served.add(outcome);
      return;
    }
    switch (outcome?.type) {
      case 'split':
        outcome.weights.forEach((weight, index) => {
          if (weight > 0) served.add(index);
        });
        served.add(outcome.defaultVariant);
        return;
      case 'rollout':
        served.add(outcome.rollFromVariant);
        served.add(outcome.rollToVariant);
        served.add(outcome.defaultVariant);
        return;
      case 'experiment':
        if (definition.experiment) {
          addOutcome({ type: 'split', ...definition.experiment });
          return;
        }
        break;
    }
    // Unknown outcome: any variant may be served.
    definition.variants.forEach((_, index) => served.add(index));
  };

  addOutcome(config.fallthrough);
  for (const rule of config.rules ?? []) {
    addOutcome(rule?.outcome);
  }
  config.targets?.forEach((targetList, index) => {
    if (countTargets([targetList]) > 0) served.add(index);
  });

  return served;
}

/**
 * Lists the values when there are a few booleans or numbers, shows a single
 * value as-is, and otherwise counts the variants to keep the column narrow.
 */
function formatServes(
  definition: PackedFlagDefinition,
  served: Set<number>
): string {
  const indexes = [...served].sort((a, b) => a - b);
  const values = indexes.map(index => definition.variants[index]);

  if (values.length === 1) {
    return values[0] === undefined
      ? chalk.gray('unknown')
      : truncateEnd(formatVariantValue(values[0]), MAX_VARIANT_LENGTH, {
          omission: '…',
        });
  }

  const listable =
    values.length <= MAX_LISTED_VARIANTS &&
    values.every(
      value => typeof value === 'boolean' || typeof value === 'number'
    );
  return listable
    ? values.map(value => formatVariantValue(value)).join(', ')
    : plural('variant', values.length, true);
}

function countTargets(targets: PackedTargetList[] | undefined): number {
  let count = 0;
  for (const targetList of targets ?? []) {
    for (const attributes of Object.values(targetList)) {
      for (const values of Object.values(attributes)) {
        count += Array.isArray(values) ? values.length : 0;
      }
    }
  }
  return count;
}
