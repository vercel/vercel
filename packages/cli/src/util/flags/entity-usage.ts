import type Client from '../client';
import { MAX_FLAGS_PAGE_LIMIT } from './get-flags';
import { getSegments } from './segments';
import type {
  Flag,
  FlagEnvironmentConfig,
  FlagsListResponse,
  Segment,
  SegmentMembershipMap,
} from './types';

export interface EntityUsage {
  /** Slugs of flags that reference the entity (attribute). */
  flags: string[];
  /** Slugs of segments that reference the entity (attribute). */
  segments: string[];
}

interface EntityReference {
  kind: string;
  attribute: string;
}

export interface EntityUsageSources {
  flags: Flag[];
  segments: Segment[];
}

/**
 * The API does not reject removing an entity or attribute that flags or
 * segments still reference, so the CLI scans them before mutating settings.
 */
export async function loadEntityUsageSources(
  client: Client,
  projectId: string
): Promise<EntityUsageSources> {
  const [active, archived, segments] = await Promise.all([
    getFlagsFromDatabase(client, projectId, 'active'),
    getFlagsFromDatabase(client, projectId, 'archived'),
    getSegments(client, projectId),
  ]);

  return { flags: [...active, ...archived], segments };
}

/**
 * v2 lists search-index snapshots, which can lag successful flag writes.
 * Use the database-backed v1 listing for mutation guards, following every page.
 * This is still a preflight check, not an atomic constraint on the PATCH.
 */
async function getFlagsFromDatabase(
  client: Client,
  projectId: string,
  state: Flag['state']
): Promise<Flag[]> {
  const flags: Flag[] = [];
  const query = new URLSearchParams({
    state,
    limit: String(MAX_FLAGS_PAGE_LIMIT),
  });
  let cursor: string | null;
  do {
    const response = await client.fetch<FlagsListResponse>(
      `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/flags?${query}`
    );
    flags.push(...response.data);
    cursor = response.pagination?.next ?? null;
    if (cursor) {
      query.set('cursor', cursor);
    }
  } while (cursor);
  return flags;
}

export function collectEntityUsage(
  sources: EntityUsageSources,
  kind: string,
  attribute?: string
): EntityUsage {
  const matches = (reference: EntityReference) =>
    reference.kind === kind &&
    (attribute === undefined || reference.attribute === attribute);

  return {
    flags: sources.flags
      .filter(flag => flagReferences(flag).some(matches))
      .map(flag => flag.slug),
    segments: sources.segments
      .filter(segment => segmentReferences(segment).some(matches))
      .map(segment => segment.slug),
  };
}

export function hasEntityUsage(usage: EntityUsage): boolean {
  return usage.flags.length > 0 || usage.segments.length > 0;
}

function flagReferences(flag: Flag): EntityReference[] {
  const references = Object.values(flag.environments).flatMap(
    environmentReferences
  );
  // Experiment outcomes have no base of their own; assignment is defined on
  // the flag, including when no environment currently uses the experiment.
  if (flag.experiment) {
    references.push(flag.experiment.base);
  }
  return references;
}

function environmentReferences(
  environment: FlagEnvironmentConfig
): EntityReference[] {
  const references: EntityReference[] = [];

  if (
    environment.fallthrough.type === 'split' ||
    environment.fallthrough.type === 'rollout'
  ) {
    references.push(environment.fallthrough.base);
  }
  for (const rule of environment.rules) {
    for (const condition of rule.conditions) {
      if (condition.lhs.type === 'entity') {
        references.push(condition.lhs);
      }
    }
    if (rule.outcome.type === 'split' || rule.outcome.type === 'rollout') {
      references.push(rule.outcome.base);
    }
  }
  // targets are keyed by variant ID, then entity kind, then attribute.
  for (const targets of Object.values(environment.targets ?? {})) {
    references.push(...membershipReferences(targets));
  }

  return references;
}

function segmentReferences(segment: Segment): EntityReference[] {
  const references: EntityReference[] = [];

  for (const rule of segment.data.rules ?? []) {
    for (const condition of rule.conditions) {
      if (condition.lhs.type === 'entity') {
        references.push(condition.lhs);
      }
    }
    if (rule.outcome.type === 'split') {
      references.push(rule.outcome.base);
    }
  }
  references.push(...membershipReferences(segment.data.include));
  references.push(...membershipReferences(segment.data.exclude));

  return references;
}

function membershipReferences(
  map: SegmentMembershipMap | undefined
): EntityReference[] {
  if (!map) {
    return [];
  }
  return Object.entries(map).flatMap(([kind, attributes]) =>
    Object.entries(attributes)
      .filter(([, values]) => values.length > 0)
      .map(([attribute]) => ({ kind, attribute }))
  );
}
