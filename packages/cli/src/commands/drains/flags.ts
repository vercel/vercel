import type {
  DrainSamplingRule,
  DrainSchemaName,
} from '../../util/drains/types';

export const DRAIN_SCHEMA_NAMES: readonly DrainSchemaName[] = [
  'log',
  'trace',
  'analytics',
  'speed_insights',
  'ai_gateway',
  'audit_log',
  'connect',
] as const;

export const DRAIN_ENCODINGS = ['json', 'ndjson'] as const;
export type DrainEncoding = (typeof DRAIN_ENCODINGS)[number];

export const DRAIN_COMPRESSIONS = ['gzip', 'none'] as const;
export type DrainCompression = (typeof DRAIN_COMPRESSIONS)[number];

export const SAMPLING_ENVIRONMENTS = ['production', 'preview'] as const;
export type SamplingEnvironment = (typeof SAMPLING_ENVIRONMENTS)[number];

export function isDrainSchemaName(value: string): value is DrainSchemaName {
  return (DRAIN_SCHEMA_NAMES as readonly string[]).includes(value);
}

export function isDrainEncoding(value: string): value is DrainEncoding {
  return (DRAIN_ENCODINGS as readonly string[]).includes(value);
}

export function isDrainCompression(value: string): value is DrainCompression {
  return (DRAIN_COMPRESSIONS as readonly string[]).includes(value);
}

export function isSamplingEnvironment(
  value: string
): value is SamplingEnvironment {
  return (SAMPLING_ENVIRONMENTS as readonly string[]).includes(value);
}

export function validateEndpointUrl(value: string): string | undefined {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return 'The --endpoint value must be a valid HTTP(S) URL, e.g. https://logs.example.com/ingest.';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'The --endpoint value must use the http or https protocol.';
  }
  return undefined;
}

export type ParsedHeaders =
  | { ok: true; headers: Record<string, string> }
  | { ok: false; error: string };

/**
 * Parses repeatable `--header 'Key: Value'` flags into a headers record.
 * Splits on the first colon; later duplicates of a key win.
 */
export function parseHeaderFlags(values: string[]): ParsedHeaders {
  const headers: Record<string, string> = {};
  for (const value of values) {
    const sep = value.indexOf(':');
    const key = sep === -1 ? '' : value.slice(0, sep).trim();
    const headerValue = sep === -1 ? '' : value.slice(sep + 1).trim();
    if (!key || !headerValue) {
      return {
        ok: false,
        error: `Couldn't parse header. Use --header 'Key: Value' with a colon between the name and the value.`,
      };
    }
    headers[key] = headerValue;
  }
  return { ok: true, headers };
}

export function validateSamplingRate(rate: number): string | undefined {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    return 'The --sampling value must be a number between 0 and 1, e.g. 0.1 for 10%.';
  }
  return undefined;
}

export function buildSamplingRules(
  schemaName: DrainSchemaName,
  rate: number,
  env?: SamplingEnvironment
): DrainSamplingRule[] {
  const rule: DrainSamplingRule = { type: schemaName, rate };
  if (env) {
    rule.env = env;
  }
  return [rule];
}
