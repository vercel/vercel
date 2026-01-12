import type { Pep440Constraint } from './pep440';
import { pep440Satisfies } from './pep440';
import type {
  PythonBuild,
  PythonConstraint,
  PythonRequest,
  PythonVariant,
  PythonVersion,
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
      const sources = constraintsWithMatches.map(i => constraints[i].source);
      warnings.push(
        `Python version constraints may not overlap: ${sources.join(', ')}`
      );
    }
  }

  // Build the error message
  const constraintDescriptions = constraints.map(c => c.source).join(', ');
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
  return constraints.map(c => `${c.operator}${c.prefix}${c.version}`).join(',');
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
