import type { Pep440Constraint } from './pep440';
import { pep440Satisfies } from './pep440';
import type {
  PythonBuild,
  PythonConstraint,
  PythonRequest,
  PythonVariant,
  PythonVersion,
  PythonVersionRequest,
} from './python-specifiers';
import { PythonImplementation } from './python-specifiers';

/**
 * Result of selecting a Python build.
 */
export interface PythonSelectionResult {
  /** The selected build, or null if no build matches. */
  build: PythonBuild | null;
  /** Error messages if selection failed. */
  errors?: string[];
  /** Warning messages (e.g., non-overlapping constraints). */
  warnings?: string[];
}

/**
 * Select the best Python build that matches all constraints.
 *
 * @param constraints - Array of Python constraints from various sources
 * @param available - Array of available Python builds to choose from
 * @returns The first matching build, or null with errors/warnings if none match
 */
export function selectPython(
  constraints: PythonConstraint[],
  available: PythonBuild[]
): PythonSelectionResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // If no constraints, return the first available build
  if (constraints.length === 0) {
    return {
      build: available.length > 0 ? available[0] : null,
      errors:
        available.length === 0 ? ['No Python builds available'] : undefined,
    };
  }

  // Check for non-overlapping constraints by tracking which constraints each build satisfies
  const constraintMatches: Map<number, PythonBuild[]> = new Map();
  for (let i = 0; i < constraints.length; i++) {
    constraintMatches.set(i, []);
  }

  // Find the first build that matches all constraints
  for (const build of available) {
    let matchesAll = true;
    for (let i = 0; i < constraints.length; i++) {
      const constraint = constraints[i];
      if (buildMatchesConstraint(build, constraint)) {
        constraintMatches.get(i)?.push(build);
      } else {
        matchesAll = false;
      }
    }
    if (matchesAll) {
      // Return the first build that matches all constraints
      return {
        build,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
  }

  // No build matched all constraints - check for non-overlapping constraints
  if (constraints.length > 1) {
    // Find constraints that have matching builds individually but conflict with each other
    const constraintsWithMatches: number[] = [];

    for (let i = 0; i < constraints.length; i++) {
      const matches = constraintMatches.get(i) ?? [];
      if (matches.length > 0) {
        constraintsWithMatches.push(i);
      }
    }

    // If some constraints have matches but no build satisfies all, they don't overlap
    if (constraintsWithMatches.length > 1) {
      const sources = constraintsWithMatches.map(
        i => constraints[i].prettySource
      );
      warnings.push(
        `Python version constraints may not overlap: ${sources.join(', ')}`
      );
    }
  }

  // Build the error message
  const constraintDescriptions = constraints
    .map(c => c.prettySource)
    .join(', ');
  errors.push(
    `No Python build satisfies all constraints: ${constraintDescriptions}`
  );

  return {
    build: null,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Result of the higher-level selectPythonVersion function.
 */
export interface PythonVersionSelectionResult {
  /** The selected build. Falls back to defaultBuild if no constraints match. */
  build: PythonBuild;
  /** Source file where the constraint originated (e.g. "pyproject.toml"). */
  source?: string;
  /** Diagnostic indicating the constraint was found but the build isn't in availableBuilds. */
  notAvailable?: {
    build: PythonBuild;
    /** The version string of the unavailable build. */
    version: string;
  };
  /** Diagnostic indicating no build matches the constraint at all. */
  invalidConstraint?: {
    /** Human-readable version string from the constraint. */
    versionString: string;
  };
}

/**
 * Higher-level Python version selection with two-pass matching and diagnostics.
 *
 * First tries to match constraints against availableBuilds. If no match,
 * tries against allBuilds to produce diagnostic information. Falls back
 * to defaultBuild if no constraints are provided or no match is found.
 */
export function selectPythonVersion({
  constraints,
  availableBuilds,
  allBuilds,
  defaultBuild,
  majorMinorOnly,
  legacyTildeEquals,
}: {
  constraints?: PythonConstraint[];
  availableBuilds: PythonBuild[];
  allBuilds: PythonBuild[];
  defaultBuild: PythonBuild;
  majorMinorOnly?: boolean;
  /**
   * When true, treat 2-part compatible-release specifiers (`~=X.Y`) as
   * pinning to exactly that minor version (`==X.Y.*`) rather than the
   * PEP 440 correct `>=X.Y, <(X+1).0`.  This preserves the historical
   * behaviour of the Python builder prior to the python-analysis migration.
   */
  legacyTildeEquals?: boolean;
}): PythonVersionSelectionResult {
  const source = constraints?.[0]?.source;

  if (!constraints || constraints.length === 0) {
    return { build: defaultBuild };
  }

  let effectiveConstraints = majorMinorOnly
    ? constraints.map(c => ({
        ...c,
        request: c.request.map(truncatePatchVersionsInRequest),
      }))
    : constraints;

  if (legacyTildeEquals) {
    effectiveConstraints = effectiveConstraints.map(c => ({
      ...c,
      request: c.request.map(legacyTildeEqualsTransform),
    }));
  }

  // First pass: try against available builds
  const result = selectPython(effectiveConstraints, availableBuilds);
  if (result.build) {
    return { build: result.build, source };
  }

  // Second pass: try against all builds for diagnostics
  const allResult = selectPython(effectiveConstraints, allBuilds);
  if (allResult.build) {
    const version = pythonVersionToString(allResult.build.version);
    return {
      build: defaultBuild,
      source,
      notAvailable: { build: allResult.build, version },
    };
  }

  // No match at all — extract version string for error message
  const versionString = extractConstraintVersionString(constraints);
  return {
    build: defaultBuild,
    source,
    invalidConstraint: { versionString },
  };
}

/**
 * Extract a human-readable version string from PythonConstraint objects
 * for use in warning/error messages.
 */
function extractConstraintVersionString(
  constraints: PythonConstraint[]
): string {
  for (const c of constraints) {
    for (const req of c.request) {
      if (req.version?.constraint && req.version.constraint.length > 0) {
        const specs = req.version.constraint;
        if (
          specs.length === 1 &&
          specs[0].operator === '==' &&
          (!specs[0].prefix || specs[0].prefix === '.*')
        ) {
          return specs[0].version;
        }
        return pep440ConstraintsToString(specs);
      }
    }
  }
  return 'unknown';
}

/**
 * Truncate patch versions in a PythonRequest's version constraints.
 * Used by `majorMinorOnly` to transform constraints for major.minor-only matching.
 */
function truncatePatchVersionsInRequest(req: PythonRequest): PythonRequest {
  if (!req.version?.constraint || req.version.constraint.length === 0) {
    return req;
  }

  const newConstraints: Pep440Constraint[] = [];
  for (const c of req.version.constraint) {
    const result = truncatePatchConstraint(c);
    if (result !== null) {
      newConstraints.push(result);
    }
  }

  const newVersion: PythonVersionRequest = {
    ...req.version,
    constraint: newConstraints,
  };
  return { ...req, version: newVersion };
}

/**
 * Truncate a single PEP 440 constraint to major.minor level.
 * Returns null if the constraint should be dropped entirely.
 *
 * Transformation rules for constraints with 3+ dot-separated version parts:
 * - `==X.Y.Z` -> `==X.Y.*` (prefix match)
 * - `!=X.Y.Z` -> dropped (trivially satisfied)
 * - `~=X.Y.Z` -> `==X.Y.*` (compatible release at minor level)
 * - `>=X.Y.Z` -> `>=X.Y` (drop patch)
 * - `<=X.Y.Z` -> `<=X.Y` (drop patch)
 * - `>X.Y.Z`  -> `>=X.Y` when Z>0, `>X.Y` when Z==0
 * - `<X.Y.Z`  -> `<=X.Y` when Z>0, `<X.Y` when Z==0
 */
function truncatePatchConstraint(c: Pep440Constraint): Pep440Constraint | null {
  // Skip arbitrary equality
  if (c.operator === '===') {
    return c;
  }

  const parts = c.version.split('.');
  if (parts.length < 3) {
    return c;
  }

  const majorMinor = parts.slice(0, 2).join('.');
  const patch = parseInt(parts[2], 10);

  switch (c.operator) {
    case '==':
      return { operator: '==', version: majorMinor, prefix: '.*' };
    case '!=':
      return null; // drop: X.Y != X.Y.Z is trivially true
    case '~=':
      return { operator: '==', version: majorMinor, prefix: '.*' };
    case '>=':
      return { operator: '>=', version: majorMinor, prefix: '' };
    case '<=':
      return { operator: '<=', version: majorMinor, prefix: '' };
    case '>':
      return patch === 0
        ? { operator: '>', version: majorMinor, prefix: '' }
        : { operator: '>=', version: majorMinor, prefix: '' };
    case '<':
      return patch === 0
        ? { operator: '<', version: majorMinor, prefix: '' }
        : { operator: '<=', version: majorMinor, prefix: '' };
    default:
      return c;
  }
}

/**
 * Transform 2-part `~=X.Y` into `==X.Y.*` to match the historical builder
 * behaviour where `~=3.10` was interpreted as `>=3.10, <3.11` (i.e., pinned
 * to the minor version) rather than the PEP 440 correct `>=3.10, <4.0`.
 *
 * 3-part `~=X.Y.Z` is unaffected — `truncatePatchConstraint` already
 * converts it to `==X.Y.*`.
 */
function legacyTildeEqualsTransform(req: PythonRequest): PythonRequest {
  if (!req.version?.constraint || req.version.constraint.length === 0) {
    return req;
  }

  const newConstraints = req.version.constraint.map((c): Pep440Constraint => {
    if (c.operator !== '~=') return c;
    const parts = c.version.split('.');
    if (parts.length === 2) {
      return { operator: '==', version: c.version, prefix: '.*' };
    }
    return c;
  });

  return {
    ...req,
    version: { ...req.version, constraint: newConstraints },
  };
}

/**
 * Convert a PythonVersion to a string suitable for PEP 440 comparison.
 *
 * @param version - The Python version object to convert
 * @returns A version string like "3.12", "3.12.1", or "3.13.0a1"
 *
 * @example
 * pythonVersionToString({ major: 3, minor: 12 }) // "3.12"
 * pythonVersionToString({ major: 3, minor: 12, patch: 1 }) // "3.12.1"
 * pythonVersionToString({ major: 3, minor: 13, patch: 0, prerelease: "a1" }) // "3.13.0a1"
 */
export function pythonVersionToString(version: PythonVersion): string {
  let str = `${version.major}.${version.minor}`;
  if (version.patch !== undefined) {
    str += `.${version.patch}`;
  }
  if (version.prerelease) {
    str += version.prerelease;
  }
  return str;
}

/**
 * Convert an array of Pep440Constraint to a specifier string.
 *
 * @param constraints - Array of PEP 440 version constraints
 * @returns A comma-separated specifier string like ">=3.12,<3.14"
 *
 * @example
 * pep440ConstraintsToString([{ operator: '>=', version: '3.12', prefix: '' }]) // ">=3.12"
 * pep440ConstraintsToString([
 *   { operator: '>=', version: '3.12', prefix: '' },
 *   { operator: '<', version: '3.14', prefix: '' }
 * ]) // ">=3.12,<3.14"
 */
export function pep440ConstraintsToString(
  constraints: Pep440Constraint[]
): string {
  return constraints
    .map(c => `${c.operator}${c.version}${c.prefix ?? ''}`)
    .join(',');
}

/**
 * Check if two PythonImplementation values are equal.
 *
 * Handles both known implementations (cpython, pypy, etc.) and unknown
 * implementations (custom strings). Known implementations are compared
 * by identity, unknown implementations by their string value.
 *
 * @param buildImpl - The implementation of the available build
 * @param requestImpl - The implementation requested by the constraint
 * @returns True if the implementations match
 *
 * @example
 * implementationsMatch('cpython', 'cpython') // true
 * implementationsMatch('cpython', 'pypy') // false
 * implementationsMatch({ implementation: 'custom' }, { implementation: 'custom' }) // true
 */
export function implementationsMatch(
  buildImpl: PythonImplementation,
  requestImpl: PythonImplementation
): boolean {
  if (PythonImplementation.isUnknown(buildImpl)) {
    if (PythonImplementation.isUnknown(requestImpl)) {
      return buildImpl.implementation === requestImpl.implementation;
    }
    return false;
  }
  if (PythonImplementation.isUnknown(requestImpl)) {
    return false;
  }
  return buildImpl === requestImpl;
}

/**
 * Check if two PythonVariant values are equal.
 *
 * Handles both known variants (default, debug, freethreaded, etc.) and
 * unknown variants. Known variants are compared by identity, unknown
 * variants by their string value.
 *
 * @param buildVariant - The variant of the available build
 * @param requestVariant - The variant requested by the constraint
 * @returns True if the variants match
 *
 * @example
 * variantsMatch('default', 'default') // true
 * variantsMatch('freethreaded', 'debug') // false
 * variantsMatch({ type: 'unknown', variant: 'custom' }, { type: 'unknown', variant: 'custom' }) // true
 */
export function variantsMatch(
  buildVariant: PythonVariant,
  requestVariant: PythonVariant
): boolean {
  if (typeof buildVariant === 'object' && 'type' in buildVariant) {
    if (typeof requestVariant === 'object' && 'type' in requestVariant) {
      return buildVariant.variant === requestVariant.variant;
    }
    return false;
  }
  if (typeof requestVariant === 'object' && 'type' in requestVariant) {
    return false;
  }
  return buildVariant === requestVariant;
}

/**
 * Check if a build matches a single PythonRequest.
 *
 * A build matches a request if all specified fields in the request match
 * the corresponding fields in the build. Unspecified fields in the request
 * are treated as wildcards (match anything).
 *
 * @param build - The available Python build to check
 * @param request - The Python request specifying desired properties
 * @returns True if the build satisfies all specified requirements in the request
 *
 * @example
 * // Request with only version constraint
 * buildMatchesRequest(build, { version: { constraint: [{ operator: '>=', version: '3.12', prefix: '' }] } })
 *
 * // Request with implementation and platform
 * buildMatchesRequest(build, { implementation: 'cpython', platform: { os: 'linux' } })
 */
export function buildMatchesRequest(
  build: PythonBuild,
  request: PythonRequest
): boolean {
  // Check implementation if specified
  if (request.implementation !== undefined) {
    if (!implementationsMatch(build.implementation, request.implementation)) {
      return false;
    }
  }

  // Check version if specified
  if (request.version !== undefined) {
    const versionConstraints = request.version.constraint;
    if (versionConstraints.length > 0) {
      const buildVersionStr = pythonVersionToString(build.version);
      const specifier = pep440ConstraintsToString(versionConstraints);
      if (!pep440Satisfies(buildVersionStr, specifier)) {
        return false;
      }
    }

    // Check variant if specified
    if (request.version.variant !== undefined) {
      if (!variantsMatch(build.variant, request.version.variant)) {
        return false;
      }
    }
  }

  // Check platform if specified
  if (request.platform !== undefined) {
    const platform = request.platform;

    if (platform.os !== undefined) {
      if (build.os.toLowerCase() !== platform.os.toLowerCase()) {
        return false;
      }
    }

    if (platform.arch !== undefined) {
      if (build.architecture.toLowerCase() !== platform.arch.toLowerCase()) {
        return false;
      }
    }

    if (platform.libc !== undefined) {
      if (build.libc.toLowerCase() !== platform.libc.toLowerCase()) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Check if a build matches a PythonConstraint.
 *
 * A constraint contains one or more requests combined with OR logic.
 * The constraint is satisfied if the build matches at least one of its requests.
 * An empty request array is treated as "match anything".
 *
 * @param build - The available Python build to check
 * @param constraint - The constraint containing one or more requests
 * @returns True if the build matches at least one request in the constraint
 *
 * @example
 * // Constraint with multiple alternative requests (OR logic)
 * buildMatchesConstraint(build, {
 *   request: [
 *     { implementation: 'cpython', version: { constraint: [...] } },
 *     { implementation: 'pypy', version: { constraint: [...] } }
 *   ],
 *   source: '.python-version'
 * })
 */
export function buildMatchesConstraint(
  build: PythonBuild,
  constraint: PythonConstraint
): boolean {
  // If there are no requests, the constraint is satisfied
  if (constraint.request.length === 0) {
    return true;
  }

  // At least one request must match
  for (const request of constraint.request) {
    if (buildMatchesRequest(build, request)) {
      return true;
    }
  }

  return false;
}
