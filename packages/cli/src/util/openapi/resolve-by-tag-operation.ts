import type { EndpointInfo } from './types';
import { foldNamingStyle } from './fold-naming-style';
import { inferCliSubcommandAliases } from './infer-cli-aliases';

export type ResolveByTagOperationResult =
  | { ok: true; endpoint: EndpointInfo }
  | {
      ok: false;
      reason: 'no_tag' | 'no_operation' | 'ambiguous_operation';
      tag: string;
      tagMatches: EndpointInfo[];
      operationHint: string;
    };

function operationIdOrAliasMatches(
  ep: EndpointInfo,
  hintFolded: string
): boolean {
  if (foldNamingStyle(ep.operationId) === hintFolded) {
    return true;
  }
  for (const a of ep.vercelCliAliases) {
    if (foldNamingStyle(a) === hintFolded) {
      return true;
    }
  }
  for (const a of inferCliSubcommandAliases(ep)) {
    if (foldNamingStyle(a) === hintFolded) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve an OpenAPI operation from a tag name and an operationId (or CLI alias).
 * Matches against {@link EndpointInfo.operationId} and {@link EndpointInfo.vercelCliAliases}
 * using case-insensitive, naming-style-folded comparison.
 */
export function resolveEndpointByTagAndOperationId(
  endpoints: EndpointInfo[],
  tag: string,
  operationHint: string
): ResolveByTagOperationResult {
  const tagLower = tag.toLowerCase();
  const tagMatches = endpoints.filter(ep =>
    ep.tags.some(t => t.toLowerCase() === tagLower)
  );

  if (tagMatches.length === 0) {
    return {
      ok: false,
      reason: 'no_tag',
      tag,
      tagMatches: [],
      operationHint,
    };
  }

  const withOpId = tagMatches.filter(ep => ep.operationId.length > 0);
  if (withOpId.length === 0) {
    return {
      ok: false,
      reason: 'no_operation',
      tag,
      tagMatches,
      operationHint,
    };
  }

  const hint = operationHint.trim();
  const hintFolded = foldNamingStyle(hint);

  // Exact operationId match first (case-sensitive)
  const exact = withOpId.filter(ep => ep.operationId === hint);
  if (exact.length === 1) {
    return { ok: true, endpoint: exact[0] };
  }
  if (exact.length > 1) {
    return {
      ok: false,
      reason: 'ambiguous_operation',
      tag,
      tagMatches: exact,
      operationHint: hint,
    };
  }

  // Folded match: operationId OR aliases (handles ls→list, rm→remove, etc.)
  const aliasMatches = withOpId.filter(ep =>
    operationIdOrAliasMatches(ep, hintFolded)
  );
  if (aliasMatches.length === 1) {
    return { ok: true, endpoint: aliasMatches[0] };
  }
  if (aliasMatches.length > 1) {
    return {
      ok: false,
      reason: 'ambiguous_operation',
      tag,
      tagMatches: aliasMatches,
      operationHint: hint,
    };
  }

  return {
    ok: false,
    reason: 'no_operation',
    tag,
    tagMatches,
    operationHint: hint,
  };
}
