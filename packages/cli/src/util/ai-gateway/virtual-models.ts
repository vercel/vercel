import type { JSONValue } from '@vercel-internals/types';
import type Client from '../client';
import { fetchAllPages, type Page } from '../pagination';

export type VirtualModelKind = 'alias' | 'relay';

export const VIRTUAL_MODEL_KINDS: VirtualModelKind[] = ['alias', 'relay'];

export type InferenceRegion = {
  scope?: 'specific' | 'zone' | 'global';
  geoRegion?: string;
  providerRegion?: string;
  providers?: Record<string, InferenceRegion | null>;
};

export type ProviderTimeouts = {
  byok?: Record<string, number>;
};

export type VirtualModel = {
  ownerId: string;
  virtualModelSlug: string;
  modelSlug?: string;
  kind?: VirtualModelKind;
  displayName?: string;
  description?: string;
  status?: string;
  visibility?: string;
  updatedBy?: string;
  deleted?: boolean;
  baseUrl?: string;
  providerOrder?: string[];
  providerOnly?: string[];
  observabilityTags?: string[];
  inferenceRegion?: InferenceRegion;
  models?: string[];
  sort?: string;
  has?: string[];
  caching?: string;
  serviceTier?: string;
  providerTimeouts?: ProviderTimeouts;
  providerOptions?: Record<string, Record<string, JSONValue>>;
  zeroDataRetention?: boolean;
  disallowPromptTraining?: boolean;
  speed?: string;
  allowFallbackFromFast?: boolean;
  createdAt: number;
  updatedAt: number;
};

const MAX_PAGE_SIZE = 200;

type ListVirtualModelsResponse = {
  virtualModelConfigs: VirtualModel[];
  cursor?: string | null;
};

// ownerId is never sent: the api derives it from the caller's credentials.
/** One page of virtual models, ordered by slug. `next` is null at the end. */
export async function listVirtualModelsPage(
  client: Client,
  opts: { limit?: number; next?: string; includeArchived: boolean }
): Promise<Page<VirtualModel>> {
  const query = new URLSearchParams({
    includeArchived: String(opts.includeArchived),
  });
  if (opts.limit !== undefined) {
    query.set('limit', String(opts.limit));
  }
  if (opts.next) {
    query.set('cursor', opts.next);
  }
  const page = await client.fetch<ListVirtualModelsResponse>(
    `/ai-gateway/virtual-model-configs/list?${query.toString()}`,
    { method: 'GET' }
  );
  return { items: page.virtualModelConfigs ?? [], next: page.cursor ?? null };
}

/** Every virtual model, archived included, following cursors. */
export async function listVirtualModels(
  client: Client
): Promise<VirtualModel[]> {
  return fetchAllPages(next =>
    listVirtualModelsPage(client, {
      limit: MAX_PAGE_SIZE,
      next,
      includeArchived: true,
    })
  );
}

export async function getVirtualModel(
  client: Client,
  virtualModelSlug: string
): Promise<VirtualModel> {
  return client.fetch<VirtualModel>(virtualModelPath(virtualModelSlug), {
    method: 'GET',
  });
}

function virtualModelPath(virtualModelSlug: string): string {
  return `/ai-gateway/virtual-model-configs/${encodeURIComponent(virtualModelSlug)}`;
}

export type VirtualModelInput = Partial<
  Omit<VirtualModel, 'ownerId' | 'createdAt' | 'updatedAt'>
> & { virtualModelSlug: string };

export async function createVirtualModel(
  client: Client,
  input: VirtualModelInput
): Promise<VirtualModel> {
  return client.fetch<VirtualModel>('/ai-gateway/virtual-model-configs', {
    method: 'POST',
    body: input,
  });
}

export async function updateVirtualModel(
  client: Client,
  input: VirtualModelInput
): Promise<VirtualModel> {
  const { virtualModelSlug, ...updates } = input;
  return client.fetch<VirtualModel>(virtualModelPath(virtualModelSlug), {
    method: 'PATCH',
    body: updates,
  });
}

export async function restoreVirtualModel(
  client: Client,
  virtualModelSlug: string
): Promise<VirtualModel> {
  return client.fetch<VirtualModel>(virtualModelPath(virtualModelSlug), {
    method: 'PATCH',
    body: { deleted: false },
  });
}

export async function deleteVirtualModel(
  client: Client,
  virtualModelSlug: string
): Promise<void> {
  await client.fetch(virtualModelPath(virtualModelSlug), { method: 'DELETE' });
}

export function parseConfigFlag(
  raw: string | undefined,
  subject = 'The --config option',
  settableFields: Record<string, true> = SETTABLE_FIELDS
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw) return { ok: true, value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: `${subject} must be valid JSON.` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: `${subject} must be a JSON object.` };
  }
  const unknownFields = Object.keys(parsed).filter(
    field => !Object.hasOwn(settableFields, field)
  );
  if (unknownFields.length > 0) {
    // An unknown key carrying a plain object is almost always the
    // providerOptions value shape without its wrapper. Name the fix instead
    // of only listing fields.
    const objectValued = unknownFields.filter(field => {
      const v = parsed[field as keyof typeof parsed];
      return typeof v === 'object' && v !== null && !Array.isArray(v);
    });
    const hint =
      objectValued.length > 0
        ? ` ${objectValued.length === 1 ? 'That looks' : 'Those look'} like provider options; wrap ${objectValued.length === 1 ? 'it' : 'them'} as { "providerOptions": { "${objectValued[0]}": { ... } } }.`
        : '';
    return {
      ok: false,
      error: `${unknownFields.length === 1 ? 'Unknown field' : 'Unknown fields'}: ${unknownFields.join(', ')}.${hint} Settable fields are: ${Object.keys(settableFields).sort().join(', ')}.`,
    };
  }
  for (const [field, allowed] of Object.entries(ENUM_FIELD_VALUES)) {
    const v = (parsed as Record<string, unknown>)[field];
    if (v !== undefined && (typeof v !== 'string' || !allowed.includes(v))) {
      return {
        ok: false,
        error: `Invalid ${field}: ${JSON.stringify(v)}. Valid values are: ${allowed.join(', ')}.`,
      };
    }
  }
  const has = (parsed as Record<string, unknown>).has;
  if (has !== undefined) {
    if (!Array.isArray(has)) {
      return {
        ok: false,
        error: `has must be an array of: ${HAS_VALUES.join(', ')}.`,
      };
    }
    const bad = has.find(
      entry => !HAS_VALUES.includes(entry as (typeof HAS_VALUES)[number])
    );
    if (bad !== undefined) {
      return {
        ok: false,
        error: `Invalid has entry: ${JSON.stringify(bad)}. Valid values are: ${HAS_VALUES.join(', ')}.`,
      };
    }
  }
  const providerOptions = (parsed as Record<string, unknown>).providerOptions;
  if (providerOptions !== undefined) {
    const shapeError = invalidProviderOptions(providerOptions);
    if (shapeError) {
      return { ok: false, error: shapeError };
    }
  }
  for (const field of BOOLEAN_FIELDS) {
    const v = (parsed as Record<string, unknown>)[field];
    if (v !== undefined && typeof v !== 'boolean') {
      return { ok: false, error: `${field} must be true or false.` };
    }
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

export function invalidProviderOptions(value: unknown): string | undefined {
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!isRecord(value) || Object.values(value).some(v => !isRecord(v))) {
    return 'providerOptions must be an object of per-provider objects, e.g. {"anthropic": {"effort": "high"}}.';
  }
  return undefined;
}

// Mirrors the gateway api's virtual-model-config schema so a bad value fails
// here with one line instead of the server's zod dump.
const ENUM_FIELD_VALUES: Record<string, readonly string[]> = {
  sort: ['@default', 'cost', 'ttft', 'tps', 'price', 'latency', 'throughput'],
  serviceTier: ['@default', 'flex', 'priority', 'fast'],
  caching: ['@default', 'auto'],
  speed: ['fast'],
};
const HAS_VALUES = ['implicit-caching', 'vision'] as const;
const BOOLEAN_FIELDS = [
  'zeroDataRetention',
  'disallowPromptTraining',
  'allowFallbackFromFast',
] as const;

export function splitList(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const items = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

const SETTABLE_FIELDS = {
  virtualModelSlug: true,
  modelSlug: true,
  kind: true,
  displayName: true,
  description: true,
  status: true,
  visibility: true,
  updatedBy: true,
  deleted: true,
  baseUrl: true,
  providerOrder: true,
  providerOnly: true,
  observabilityTags: true,
  inferenceRegion: true,
  models: true,
  sort: true,
  has: true,
  caching: true,
  serviceTier: true,
  providerTimeouts: true,
  providerOptions: true,
  zeroDataRetention: true,
  disallowPromptTraining: true,
  speed: true,
  allowFallbackFromFast: true,
} satisfies Record<keyof VirtualModelInput, true>;

// kind is create-only: the api's update schema omits it, so an edit carrying
// kind would 200 while silently changing nothing.
export const UPDATEABLE_FIELDS = {
  virtualModelSlug: true,
  modelSlug: true,
  displayName: true,
  description: true,
  status: true,
  visibility: true,
  updatedBy: true,
  deleted: true,
  baseUrl: true,
  providerOrder: true,
  providerOnly: true,
  observabilityTags: true,
  inferenceRegion: true,
  models: true,
  sort: true,
  has: true,
  caching: true,
  serviceTier: true,
  providerTimeouts: true,
  providerOptions: true,
  zeroDataRetention: true,
  disallowPromptTraining: true,
  speed: true,
  allowFallbackFromFast: true,
} satisfies Record<keyof Omit<VirtualModelInput, 'kind'>, true>;
