/** JSON utilities shared by the generator and the runner. */

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export function isJsonObject(value: unknown): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Recursively sorts object keys. Array order is preserved. */
export function sortKeys(value: unknown): Json {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isJsonObject(value)) {
    const sorted: Record<string, Json> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys(value[key]);
    }
    return sorted;
  }
  return value as Json;
}

/** The canonical on-disk format: sorted keys, 2-space indent, trailing LF. */
export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

/** RFC 7386 JSON Merge Patch. Returns a new value; inputs are not mutated. */
export function applyMergePatch(target: unknown, patch: unknown): Json {
  if (!isJsonObject(patch)) return structuredClone(patch as Json);
  const result: Record<string, Json> = isJsonObject(target)
    ? structuredClone(target)
    : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
    } else {
      result[key] = applyMergePatch(result[key], value);
    }
  }
  return result;
}

/**
 * Structural diff for failure messages. Object key order is ignored; numbers
 * and strings compare with strict equality.
 */
export function diffJson(
  expected: unknown,
  actual: unknown,
  path = '$'
): string[] {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const diffs: string[] = [];
    const length = Math.max(expected.length, actual.length);
    for (let i = 0; i < length; i++) {
      if (i >= expected.length) {
        diffs.push(`${path}[${i}]: unexpected ${show(actual[i])}`);
      } else if (i >= actual.length) {
        diffs.push(`${path}[${i}]: missing ${show(expected[i])}`);
      } else {
        diffs.push(...diffJson(expected[i], actual[i], `${path}[${i}]`));
      }
    }
    return diffs;
  }
  if (isJsonObject(expected) && isJsonObject(actual)) {
    const diffs: string[] = [];
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const key of [...keys].sort()) {
      const childPath = `${path}.${key}`;
      if (!hasOwn(actual, key)) {
        diffs.push(`${childPath}: missing (expected ${show(expected[key])})`);
      } else if (!hasOwn(expected, key)) {
        diffs.push(`${childPath}: unexpected ${show(actual[key])}`);
      } else {
        diffs.push(...diffJson(expected[key], actual[key], childPath));
      }
    }
    return diffs;
  }
  if (expected === actual) return [];
  return [`${path}: expected ${show(expected)}, actual ${show(actual)}`];
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function show(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value);
}
