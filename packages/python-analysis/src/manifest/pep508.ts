/**
 * Shared utilities for PEP 508 dependency string formatting and normalization.
 *
 * PEP 508 defines the format for Python dependency specifiers:
 * https://peps.python.org/pep-0508/
 *
 * Format: name[extras] (version) @ url ; markers
 * Examples:
 *   - requests>=2.0
 *   - requests[security]>=2.0
 *   - mypackage @ https://example.com/pkg.zip
 *   - requests>=2.0 ; python_version >= "3.8"
 */

import type { NormalizedRequirement } from './requirement/types';
import type { ParsedReqEntry } from '#wasm/vercel_python_analysis.js';
import { importWasmModule } from '../wasm/load';

/**
 * Regular expression to extract extras from a package name.
 * Matches: "package[extra1,extra2]" -> ["package", "extra1,extra2"]
 */
const EXTRAS_REGEX = /^(.+)\[([^\]]+)\]$/;

/**
 * Split a package specification into name and extras.
 *
 * @param spec - Package specification that may include extras (e.g., "requests[security,socks]")
 * @returns Tuple of [name, extras] where extras is undefined if not present
 *
 * @example
 * splitExtras("requests") // ["requests", undefined]
 * splitExtras("requests[security]") // ["requests", ["security"]]
 * splitExtras("requests[security,socks]") // ["requests", ["security", "socks"]]
 */
export function splitExtras(spec: string): [string, string[] | undefined] {
  const match = EXTRAS_REGEX.exec(spec);
  if (!match) {
    return [spec, undefined];
  }
  const extras = match[2].split(',').map(e => e.trim());
  return [match[1], extras];
}

/**
 * Normalize a Python package name according to PEP 503.
 *
 * PEP 503 specifies that package names should be compared case-insensitively
 * and with underscores, hyphens, and periods treated as equivalent.
 *
 * @param name - Package name to normalize
 * @returns Lowercase name with separators normalized to hyphens
 *
 * @example
 * normalizePackageName("My_Package.Name") // "my-package-name"
 */
export function normalizePackageName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/**
 * Format a normalized requirement as a PEP 508 dependency string.
 *
 * @param req - Normalized requirement to format
 * @returns PEP 508 formatted string
 *
 * @example
 * formatPep508({ name: "requests", version: ">=2.0" })
 * // "requests>=2.0"
 *
 * formatPep508({ name: "mypackage", url: "https://example.com/pkg.zip" })
 * // "mypackage @ https://example.com/pkg.zip"
 *
 * formatPep508({ name: "requests", version: ">=2.0", extras: ["security"], markers: "python_version >= '3.8'" })
 * // "requests[security]>=2.0 ; python_version >= '3.8'"
 */
export function formatPep508(req: NormalizedRequirement): string {
  let result = req.name;

  // Add extras: name[extra1,extra2]
  if (req.extras && req.extras.length > 0) {
    result += `[${req.extras.join(',')}]`;
  }

  // URL-based requirements use @ syntax: name @ url
  if (req.url) {
    result += ` @ ${req.url}`;
  } else if (req.version && req.version !== '*') {
    // Version specifier: name>=1.0,<2.0
    result += req.version;
  }

  // Environment markers: name>=1.0 ; python_version >= "3.8"
  if (req.markers) {
    result += ` ; ${req.markers}`;
  }

  return result;
}

/**
 * Merge extras arrays, combining and deduplicating entries.
 *
 * @param existing - Existing extras array (may be undefined)
 * @param additional - Additional extras to merge (may be undefined or a single string)
 * @returns Merged extras array, or undefined if both inputs are empty/undefined
 */
export function mergeExtras(
  existing: string[] | undefined,
  additional: string[] | string | undefined
): string[] | undefined {
  const result = new Set<string>(existing || []);

  if (additional) {
    const additionalArray = Array.isArray(additional)
      ? additional
      : [additional];
    for (const extra of additionalArray) {
      result.add(extra);
    }
  }

  return result.size > 0 ? Array.from(result) : undefined;
}

/**
 * Convert a WASM-parsed PEP 508 entry to a NormalizedRequirement.
 */
function wasmEntryToRequirement(entry: ParsedReqEntry): NormalizedRequirement {
  const req: NormalizedRequirement = {
    name: entry.name || '',
  };

  if (entry.versionSpec) {
    req.version = entry.versionSpec;
  }

  if (entry.extras.length > 0) {
    req.extras = entry.extras;
  }

  if (entry.markers) {
    req.markers = entry.markers;
  }

  if (entry.url) {
    req.url = entry.url;
  }

  return req;
}

/**
 * Parse a single PEP 508 dependency string into a NormalizedRequirement.
 *
 * Uses the uv-pep508 Rust crate via WASM for spec-compliant parsing.
 *
 * @param dep - A PEP 508 dependency string (e.g., "flask[async]>=2.0 ; python_version >= '3.8'")
 * @returns The parsed requirement, or null if parsing fails
 */
export async function parsePep508(
  dep: string
): Promise<NormalizedRequirement | null>;
/**
 * Parse multiple PEP 508 dependency strings in a single batch.
 *
 * Loads the WASM module once and parses all strings synchronously,
 * avoiding per-item async overhead.
 *
 * @param deps - Array of PEP 508 dependency strings
 * @returns Array of parsed requirements (null for entries that fail to parse)
 */
export async function parsePep508(
  deps: string[]
): Promise<(NormalizedRequirement | null)[]>;
export async function parsePep508(
  depOrDeps: string | string[]
): Promise<NormalizedRequirement | null | (NormalizedRequirement | null)[]> {
  const wasm = await importWasmModule();
  if (Array.isArray(depOrDeps)) {
    return depOrDeps.map(dep => {
      try {
        return wasmEntryToRequirement(wasm.parsePep508(dep));
      } catch {
        return null;
      }
    });
  }
  try {
    return wasmEntryToRequirement(wasm.parsePep508(depOrDeps));
  } catch {
    return null;
  }
}
