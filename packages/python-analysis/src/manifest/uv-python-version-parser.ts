// Parser for uv's .python-version files

import type { Pep440Constraint } from './pep440';
import {
  pep440ConstraintFromVersion,
  parsePep440Constraint,
  parsePep440Version,
} from './pep440';
import type { PythonRequest, PythonVersionRequest } from './python-specifiers';
import { PythonImplementation, PythonVariant } from './python-specifiers';

/**
 * uv supports these request formats in --python and .python-version:
 * - <version> (e.g. 3, 3.12, 3.12.3)
 * - <version-specifier> (e.g. >=3.12,<3.13)
 * - <version><short-variant> (e.g. 3.13t, 3.12.0d)
 * - <version>+<variant> (e.g. 3.13+freethreaded, 3.12.0+debug, 3.14+gil)
 * - <implementation> (e.g. cpython or cp)
 * - <implementation>@<version>
 * - <implementation><version> (e.g. cpython3.12 or cp312)
 * - <implementation><version-specifier> (e.g. cpython>=3.12,<3.13)
 * - <implementation>-<version>-<os>-<arch>-<libc> (e.g. cpython-3.12.3-macos-aarch64-none)
 *
 * plus local interpreter requests, which we obviously cannot support
 * - <executable-path> (e.g. /opt/homebrew/bin/python3)
 * - <executable-name> (e.g. mypython3)
 * - <install-dir> (e.g. /some/environment/)
 */

export function pythonRequestFromConstraint(
  constraint: Pep440Constraint[]
): PythonRequest {
  return {
    implementation: 'cpython',
    version: {
      constraint,
      variant: 'default',
    },
  };
}

/**
 * Parse the contents of a `.python-version` file.
 */
export function parsePythonVersionFile(
  content: string
): PythonRequest[] | null {
  const lines = content.split(/\r?\n/);
  const requests = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    const parsed = parseUvPythonRequest(trimmed);
    if (parsed != null) {
      requests.push(parsed);
    }
  }

  if (requests.length === 0) {
    return null;
  } else {
    return requests;
  }
}

/**
 * Parse a single uv python request (as in `--python ...` or `.python-version` contents).
 */
export function parseUvPythonRequest(input: string): PythonRequest | null {
  const raw = input.trim();
  if (!raw) {
    return null;
  }

  const lowercase = raw.toLowerCase();

  if (lowercase === 'any' || lowercase === 'default') {
    return {};
  }

  for (const [implName, implementation] of Object.entries(
    PythonImplementation.knownNames()
  )) {
    if (lowercase.startsWith(implName)) {
      let rest = lowercase.substring(implName.length);
      if (rest.length === 0) {
        // Implementation by itself, e.g "cpython"
        return {
          implementation,
        };
      }
      if (rest[0] === '@') {
        rest = rest.substring(1);
      }
      // Implementation and version, e.g cpython@3.12
      const version = parseVersionRequest(rest);
      if (version != null) {
        return {
          implementation,
          version,
        };
      }
    }
  }

  const version = parseVersionRequest(lowercase);
  if (version != null) {
    return {
      implementation: 'cpython',
      version,
    };
  }

  return tryParsePlatformRequest(lowercase);
}

function parseVersionRequest(input: string): PythonVersionRequest | null {
  const [version, variant] = parseVariantSuffix(input);

  // Try parsing as a standard version first
  let parsedVer = parsePep440Version(version);
  if (parsedVer != null) {
    // Check if this looks like a wheel tag format (single release component
    // like "312") and convert it to standard format (e.g., "312" -> "3.12")
    if (parsedVer.release.length === 1) {
      const converted = splitWheelTagVersion(version);
      if (converted != null) {
        const convertedVer = parsePep440Version(converted);
        if (convertedVer != null) {
          parsedVer = convertedVer;
        }
      }
    }
    return {
      constraint: pep440ConstraintFromVersion(parsedVer),
      variant,
    };
  }

  const parsedConstr = parsePep440Constraint(version);
  if (parsedConstr?.length) {
    return {
      constraint: parsedConstr,
      variant,
    };
  }

  return null;
}

/**
 * Convert a wheel tag formatted version string (e.g., "38") to standard format
 * (e.g., "3.8").
 *
 * The major version is always assumed to be a single digit 0-9. The minor
 * version is all the following content.
 *
 * Returns null if not a valid wheel tag format.
 */
function splitWheelTagVersion(version: string): string | null {
  // Must be all digits
  if (!/^\d+$/.test(version)) {
    return null;
  }

  // Must have at least 2 digits (major + at least one minor digit)
  if (version.length < 2) {
    return null;
  }

  const major = version[0];
  const minorStr = version.substring(1);

  // Validate minor can be parsed as a number
  const minor = parseInt(minorStr, 10);
  if (isNaN(minor) || minor > 255) {
    // Overflow protection similar to Rust implementation
    return null;
  }

  return `${major}.${minor}`;
}

function rfindNumericChar(s: string): number {
  for (let i = s.length - 1; i >= 0; i--) {
    const code = s.charCodeAt(i);
    if (code >= 48 && code <= 57) return i;
  }
  return -1;
}

// Parse variant from the end of the version request string.
function parseVariantSuffix(vrs: string): [string, PythonVariant] {
  let pos = rfindNumericChar(vrs);
  if (pos < 0) {
    return [vrs, 'default'];
  }

  pos += 1;

  if (pos + 1 > vrs.length) {
    return [vrs, 'default'];
  }

  let variant = vrs.substring(pos);
  if (variant[0] === '+') {
    variant = variant.substring(1);
  }

  const prefix = vrs.substring(0, pos);

  return [prefix, PythonVariant.parse(variant)];
}

function tryParsePlatformRequest(raw: string): PythonRequest | null {
  // Format: <implementation>-<version>-<os>-<arch>-<libc>
  // All segments are optional, but order is significant
  const parts = raw.split('-');
  let partIdx = 0;
  const state = ['implementation', 'version', 'os', 'arch', 'libc', 'end'];
  let stateIdx = 0;

  let implementation: PythonImplementation | undefined;
  let version;
  let os;
  let arch;
  let libc;
  // Track if we could not parse implementation or version - these are critical
  let implOrVersionFailed = false;

  for (;;) {
    // Check bounds - if we've consumed all parts or reached end state, exit
    if (partIdx >= parts.length || state[stateIdx] === 'end') {
      break;
    }
    const part = parts[partIdx].toLowerCase();
    if (part.length === 0) {
      break;
    }
    switch (state[stateIdx]) {
      case 'implementation':
        if (part === 'any') {
          partIdx += 1;
          stateIdx += 1;
          continue;
        }
        implementation = PythonImplementation.parse(part);
        if (PythonImplementation.isUnknown(implementation)) {
          // Unknown implementation - mark as failed and try next state
          implementation = undefined;
          stateIdx += 1;
          implOrVersionFailed = true;
          continue;
        }
        stateIdx += 1;
        partIdx += 1;
        break;
      case 'version':
        if (part === 'any') {
          partIdx += 1;
          stateIdx += 1;
          continue;
        }
        version = parseVersionRequest(part);
        if (version == null) {
          version = undefined;
          stateIdx += 1;
          implOrVersionFailed = true;
          continue;
        }
        stateIdx += 1;
        partIdx += 1;
        break;
      case 'os':
        if (part === 'any') {
          partIdx += 1;
          stateIdx += 1;
          continue;
        }
        os = part;
        stateIdx += 1;
        partIdx += 1;
        break;
      case 'arch':
        if (part === 'any') {
          partIdx += 1;
          stateIdx += 1;
          continue;
        }
        arch = part;
        stateIdx += 1;
        partIdx += 1;
        break;
      case 'libc':
        if (part === 'any') {
          partIdx += 1;
          stateIdx += 1;
          continue;
        }
        libc = part;
        stateIdx += 1;
        partIdx += 1;
        break;
      default:
        // Reached 'end' state or unknown state - exit the loop
        break;
    }
  }

  // If we could not parse both implementation and version, this is not a valid platform request
  if (
    implOrVersionFailed &&
    implementation === undefined &&
    version === undefined
  ) {
    return null;
  }

  let platform;
  if (os !== undefined || arch !== undefined || libc !== undefined) {
    platform = {
      os,
      arch,
      libc,
    };
  }

  return { implementation, version, platform };
}
