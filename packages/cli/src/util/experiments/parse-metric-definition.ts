import type {
  MetricDefinition,
  MetricDirectionality,
  MetricType,
  MetricUnit,
} from '../flags/types';

export const METRIC_TYPES: readonly MetricType[] = [
  'percentage',
  'currency',
  'count',
];

export const METRIC_UNITS: readonly MetricUnit[] = [
  'user',
  'session',
  'visitor',
];

export const DIRECTIONALITIES: readonly MetricDirectionality[] = [
  'increaseIsGood',
  'decreaseIsGood',
];

function assertStringField(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Metric JSON must include a non-empty string "${key}".`);
  }
  return v.trim();
}

function optionalString(
  o: Record<string, unknown>,
  key: string
): string | undefined {
  const v = o[key];
  if (v === undefined) {
    return undefined;
  }
  if (typeof v !== 'string') {
    throw new Error(`Metric JSON field "${key}" must be a string when set.`);
  }
  return v;
}

/**
 * Parses one embedded experiment metric from `--metric '<json>'` (API Metric schema).
 */
export function parseMetricDefinitionJson(raw: string): MetricDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Each --metric value must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Each --metric value must be a JSON object.');
  }
  const o = parsed as Record<string, unknown>;
  const name = assertStringField(o, 'name');
  const metricType = assertStringField(o, 'metricType');
  const metricUnit = assertStringField(o, 'metricUnit');
  const directionality = assertStringField(o, 'directionality');

  if (!METRIC_TYPES.includes(metricType as MetricType)) {
    throw new Error(`metricType must be one of: ${METRIC_TYPES.join(', ')}`);
  }
  if (!METRIC_UNITS.includes(metricUnit as MetricUnit)) {
    throw new Error(`metricUnit must be one of: ${METRIC_UNITS.join(', ')}`);
  }
  if (!DIRECTIONALITIES.includes(directionality as MetricDirectionality)) {
    throw new Error(
      `directionality must be one of: ${DIRECTIONALITIES.join(', ')}`
    );
  }

  const description = optionalString(o, 'description');
  const metricFormula = optionalString(o, 'metricFormula');

  return {
    name,
    ...(description !== undefined ? { description } : {}),
    metricType: metricType as MetricType,
    metricUnit: metricUnit as MetricUnit,
    directionality: directionality as MetricDirectionality,
    ...(metricFormula !== undefined ? { metricFormula } : {}),
  };
}

export function buildMetricDefinitionFromCli(opts: {
  name: string;
  description?: string;
  metricType: MetricType;
  metricUnit: MetricUnit;
  directionality: MetricDirectionality;
  metricFormula?: string;
}): MetricDefinition {
  return {
    name: opts.name,
    ...(opts.description !== undefined
      ? { description: opts.description }
      : {}),
    metricType: opts.metricType,
    metricUnit: opts.metricUnit,
    directionality: opts.directionality,
    ...(opts.metricFormula !== undefined
      ? { metricFormula: opts.metricFormula }
      : {}),
  };
}
