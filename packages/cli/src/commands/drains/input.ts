import type Client from '../../util/client';
import {
  DRAIN_ENVIRONMENTS,
  DRAIN_TYPES,
  type BasicDrainFilter,
  type DrainFilter,
  type DrainType,
  type HeadSamplingRule,
  LOG_SOURCES,
} from '../../util/drains/api';
import { readStdinText } from '../../util/input/read-standard-input';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';

export interface Issue {
  field: string;
  message: string;
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const MAX_SECRET_BYTES = 4096;

/** A comma-separated option value as a list, or undefined when absent. */
export function splitList(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function readName(value: string | undefined, issues: Issue[]) {
  if (value === undefined) return undefined;
  const name = value.trim();
  if (!name || name.length > 256 || CONTROL_CHARACTERS.test(name)) {
    issues.push({
      field: 'name',
      message: 'Use 1-256 characters with no control characters.',
    });
    return undefined;
  }
  return name;
}

export function readUrl(value: string | undefined, issues: Issue[]) {
  if (value === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    issues.push({
      field: 'url',
      message: 'Use a full URL, like https://example.com/drain.',
    });
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    issues.push({ field: 'url', message: 'Use an http or https URL.' });
    return undefined;
  }
  return value;
}

/**
 * Drain types the dashboard creates but the CLI doesn't yet, by the names a
 * user is likely to try, with how to name them in an error.
 */
const DASHBOARD_ONLY_TYPES: Record<string, string> = {
  'audit-log': 'an audit log drain',
  'audit-logs': 'an audit log drain',
  audit_log: 'an audit log drain',
  'ai-gateway': 'an AI Gateway drain',
  ai_gateway: 'an AI Gateway drain',
  connect: 'a Connect drain',
};

/** How to name a drain type only the dashboard creates, or undefined. */
export function getDashboardOnlyType(
  value: string | undefined
): string | undefined {
  return value === undefined ? undefined : DASHBOARD_ONLY_TYPES[value];
}

export function readType(value: string | undefined, issues: Issue[]) {
  if (value === undefined) return undefined;
  if (!(DRAIN_TYPES as readonly string[]).includes(value)) {
    issues.push({ field: 'type', message: `Use ${DRAIN_TYPES.join(', ')}.` });
    return undefined;
  }
  return value as DrainType;
}

/** The encodings each delivery accepts, the first being the default. */
export function encodingsFor(type: DrainType) {
  return type === 'traces' ? ['json', 'proto'] : ['json', 'ndjson'];
}

export function readEncoding(
  value: string | undefined,
  type: DrainType | undefined,
  issues: Issue[]
) {
  if (value === undefined || type === undefined) return undefined;
  const allowed = encodingsFor(type);
  if (!allowed.includes(value)) {
    issues.push({
      field: 'encoding',
      message: `Use ${allowed.join(' or ')} for ${type} drains.`,
    });
    return undefined;
  }
  return value;
}

/**
 * Reads `--header "Name: value"` options. Values can hold credentials, so an
 * issue names the header, never its value.
 */
export function readHeaders(values: string[] | undefined, issues: Issue[]) {
  if (values === undefined) return undefined;
  const headers: Record<string, string> = {};
  for (const [index, raw] of values.entries()) {
    const separator = raw.indexOf(':');
    const name = separator === -1 ? '' : raw.slice(0, separator).trim();
    const value = separator === -1 ? '' : raw.slice(separator + 1).trim();
    if (!HEADER_NAME.test(name) || CONTROL_CHARACTERS.test(value)) {
      issues.push({
        field: 'header',
        message: `Header ${index + 1} must look like "Name: value".`,
      });
      continue;
    }
    headers[name] = value;
  }
  return headers;
}

function readEnum(
  values: string[] | undefined,
  allowed: readonly string[],
  field: string,
  issues: Issue[]
) {
  if (values === undefined) return undefined;
  const items = [...new Set(values.flatMap(value => value.split(',')))]
    .map(value => value.trim())
    .filter(Boolean);
  const unknown = items.filter(item => !allowed.includes(item));
  if (unknown.length || items.length === 0) {
    issues.push({ field, message: `Use ${allowed.join(', ')}.` });
    return undefined;
  }
  return items;
}

export function readSources(values: string[] | undefined, issues: Issue[]) {
  return readEnum(values, LOG_SOURCES, 'source', issues);
}

export function readEnvironments(
  values: string[] | undefined,
  issues: Issue[]
) {
  return readEnum(values, DRAIN_ENVIRONMENTS, 'environment', issues);
}

export function readSampleRate(value: number | undefined, issues: Issue[]) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0 || value > 100) {
    issues.push({
      field: 'sample-rate',
      message: 'Use a percentage greater than 0 and at most 100.',
    });
    return undefined;
  }
  return value;
}

/** A sample rate as head sampling rules. 100% sends everything: no rules. */
export function toSampling(percent: number): HeadSamplingRule[] | undefined {
  if (percent >= 100) return undefined;
  return [{ type: 'head_sampling', rate: percent / 100 }];
}

/**
 * A basic filter with the given sources and environments, keeping the rest
 * of `base`. Returns undefined when nothing is filtered.
 */
export function toFilter(
  changes: { sources?: string[]; environments?: string[] },
  base: BasicDrainFilter = { type: 'basic' }
): DrainFilter | undefined {
  const filter: BasicDrainFilter = { ...base, type: 'basic' };
  if (changes.sources) filter.log = { sources: changes.sources };
  if (changes.environments) {
    filter.deployment = { environments: changes.environments };
  }
  if (!filter.log && !filter.deployment && !filter.project) return undefined;
  return { version: 'v2', filter };
}

/** Reads the signing secret from the option, or from stdin for `-`. */
export async function readSecret(
  client: Client,
  value: string | undefined
): Promise<string | undefined> {
  if (value === undefined) return undefined;
  if (value !== '-') return value;
  return readStdinText(client.stdin, MAX_SECRET_BYTES);
}

/**
 * Resolves each `--project` to its ID. Returns the names that don't exist in
 * the team instead, so the caller can report all of them at once.
 */
export async function resolveProjectIds(
  client: Client,
  projects: string[]
): Promise<{ ids: string[]; missing: string[] }> {
  const ids: string[] = [];
  const missing: string[] = [];
  for (const nameOrId of [...new Set(projects)]) {
    const project = await getProjectByNameOrId(client, nameOrId);
    if (project instanceof ProjectNotFound) {
      missing.push(nameOrId);
    } else {
      ids.push(project.id);
    }
  }
  return { ids, missing };
}
