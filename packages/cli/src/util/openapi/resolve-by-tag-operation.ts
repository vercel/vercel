import type { EndpointInfo } from './types';

export type ResolveByTagOperationResult =
  | { ok: true; endpoint: EndpointInfo }
  | {
      ok: false;
      reason: 'no_tag' | 'no_operation' | 'ambiguous_operation';
      tag: string;
      tagMatches: EndpointInfo[];
      operationHint: string;
    };

/**
 * Resolve an OpenAPI operation from a tag name and an operationId.
 * The hint must match {@link EndpointInfo.operationId} exactly (case-insensitive).
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
  const hintLower = hint.toLowerCase();

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

  const exactCi = withOpId.filter(
    ep => ep.operationId.toLowerCase() === hintLower
  );
  if (exactCi.length === 1) {
    return { ok: true, endpoint: exactCi[0] };
  }
  if (exactCi.length > 1) {
    return {
      ok: false,
      reason: 'ambiguous_operation',
      tag,
      tagMatches: exactCi,
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
