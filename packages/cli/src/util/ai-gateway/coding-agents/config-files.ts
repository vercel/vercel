import {
  readFile,
  writeFile,
  mkdir,
  copyFile,
  access,
  lstat,
} from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { dirname } from 'node:path';
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml';
import {
  applyEdits,
  modify,
  type FormattingOptions as JsonFormattingOptions,
} from 'jsonc-parser';

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** True when `path` is a symlink — `writeConfigFile` follows it, so the plan flags it. */
export async function isSymlink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}

export async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function deepMerge(base: JsonObject, patch: JsonObject): JsonObject {
  const out: JsonObject = { ...base };
  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = out[key];
    if (isPlainObject(baseValue) && isPlainObject(patchValue)) {
      out[key] = deepMerge(baseValue, patchValue);
    } else {
      out[key] = patchValue;
    }
  }
  return out;
}

/** Match the file's own indentation and line endings when inserting keys. */
function detectJsonFormatting(text: string): JsonFormattingOptions {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const indent = text.match(/^([ \t]+)\S/m)?.[1];
  if (indent?.startsWith('\t')) {
    return { eol, insertSpaces: false, tabSize: 1 };
  }
  return { eol, insertSpaces: true, tabSize: indent?.length || 2 };
}

/**
 * The user's file is edited in place, never re-serialized: only the keys the
 * patch sets are spliced in (deep-merge semantics), so untouched content keeps
 * its exact formatting, and a patch that changes nothing returns the input
 * byte-for-byte. The edited text is re-parsed and compared against the full
 * merged document; any divergence (e.g. duplicate keys, where the text editor
 * and JSON.parse disagree about which occurrence wins) falls back to the
 * plain merge-and-rewrite.
 */
export function mergeJson(current: string | null, patch: JsonObject): string {
  if (!current || !current.trim()) {
    return `${JSON.stringify(deepMerge({}, patch), null, 2)}\n`;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(current);
  } catch (err) {
    throw new Error(
      `existing file is not valid JSON (${(err as Error).message})`
    );
  }
  if (!isPlainObject(raw)) {
    throw new Error('existing file is not a JSON object');
  }
  const merged = deepMerge(raw, patch);
  // Single-line (minified) files take the raw un-formatted edit so they stay
  // single-line; jsonc-parser's formatter would otherwise pretty-print the
  // whole line, i.e. the whole file.
  const modifyOptions = current.trim().includes('\n')
    ? { formattingOptions: detectJsonFormatting(current) }
    : {};
  try {
    let text = current;
    const splice = (
      existing: JsonObject | undefined,
      subPatch: JsonObject,
      path: string[]
    ) => {
      for (const [key, patchValue] of Object.entries(subPatch)) {
        const existingValue = existing?.[key];
        if (isPlainObject(patchValue) && isPlainObject(existingValue)) {
          splice(existingValue, patchValue, [...path, key]);
        } else if (!isDeepStrictEqual(existingValue, patchValue)) {
          text = applyEdits(
            text,
            modify(text, [...path, key], patchValue, modifyOptions)
          );
        }
      }
    };
    splice(raw, patch, []);
    if (isDeepStrictEqual(JSON.parse(text), merged)) {
      return text;
    }
  } catch {
    // fall through to the legacy rewrite
  }
  return `${JSON.stringify(merged, null, 2)}\n`;
}

/** True when every value the patch would set already holds (deep-merge view). */
function patchSatisfied(existing: unknown, patch: JsonObject): boolean {
  for (const [key, patchValue] of Object.entries(patch)) {
    const existingValue = isPlainObject(existing)
      ? existing[key]
      : (undefined as unknown);
    if (isPlainObject(patchValue) && isPlainObject(existingValue)) {
      if (!patchSatisfied(existingValue, patchValue)) {
        return false;
      }
    } else if (!isDeepStrictEqual(existingValue, patchValue)) {
      return false;
    }
  }
  return true;
}

function tomlScalar(value: unknown): string | null {
  switch (typeof value) {
    case 'string':
      // A JSON string is a valid TOML basic string.
      return JSON.stringify(value);
    case 'number':
      return Number.isFinite(value) ? String(value) : null;
    case 'boolean':
      return String(value);
    default:
      return null;
  }
}

const TOML_BARE_KEY = /^[A-Za-z0-9_-]+$/;

/**
 * Flatten a patch into `section -> key -> serialized scalar`, where '' is the
 * top-level section and nested objects become dotted table names. Returns null
 * for shapes the line editor can't express (non-scalar leaves, keys that need
 * quoting) — those take the legacy full-rewrite path.
 */
function flattenTomlPatch(
  patch: JsonObject,
  prefix = '',
  out = new Map<string, Map<string, string>>()
): Map<string, Map<string, string>> | null {
  for (const [key, value] of Object.entries(patch)) {
    if (!TOML_BARE_KEY.test(key)) {
      return null;
    }
    if (isPlainObject(value)) {
      const nested = flattenTomlPatch(
        value,
        prefix ? `${prefix}.${key}` : key,
        out
      );
      if (!nested) {
        return null;
      }
    } else {
      const scalar = tomlScalar(value);
      if (scalar === null) {
        return null;
      }
      let section = out.get(prefix);
      if (!section) {
        section = new Map();
        out.set(prefix, section);
      }
      section.set(key, scalar);
    }
  }
  return out;
}

const TOML_HEADER = /^\s*\[\[?\s*([^\]]*?)\s*\]\]?\s*(?:#.*)?$/;

/**
 * The user's file is edited line by line, never re-serialized: assignments the
 * patch sets are replaced or appended inside their table, missing tables are
 * appended at the end, and every other line — comments, quoting, spacing —
 * survives byte-for-byte. The result is re-parsed and checked; anything the
 * editor mishandled (exotic layouts) falls back to a full merge-and-rewrite.
 */
export function mergeToml(current: string | null, patch: JsonObject): string {
  let parsed: JsonObject = {};
  if (current && current.trim()) {
    try {
      parsed = tomlParse(current) as JsonObject;
    } catch (err) {
      throw new Error(
        `existing file is not valid TOML (${(err as Error).message})`
      );
    }
  }
  const legacy = () => `${tomlStringify(deepMerge(parsed, patch))}\n`;
  if (!current || !current.trim()) {
    return legacy();
  }
  if (patchSatisfied(parsed, patch)) {
    return current;
  }
  const flat = flattenTomlPatch(patch);
  if (!flat) {
    return legacy();
  }

  const crlf = current.includes('\r\n');
  const lines = current.split('\n');
  const content = (line: string) =>
    line.endsWith('\r') ? line.slice(0, -1) : line;
  const finish = (line: string, i: number) =>
    i < lines.length && lines[i]?.endsWith('\r') ? `${line}\r` : line;

  const headerAt = (i: number): string | null => {
    const m = content(lines[i]).match(TOML_HEADER);
    if (!m) {
      return null;
    }
    return m[1]
      .split('.')
      .map(s => s.trim())
      .join('.');
  };

  // [start, end) line range of each section's body; '' is the top level.
  const sectionRange = (name: string): [number, number] | null => {
    let start = name === '' ? 0 : -1;
    for (let i = 0; i < lines.length; i++) {
      const header = headerAt(i);
      if (header === null) {
        continue;
      }
      if (start !== -1) {
        return [start, i];
      }
      if (name === '') {
        return [0, i];
      }
      if (header === name) {
        start = i + 1;
      }
    }
    return start === -1 ? null : [start, lines.length];
  };

  const appendSections: string[] = [];
  // Sections are edited independently; insertions go through a per-section
  // splice so earlier line indices stay valid (append-only within a range).
  for (const [name, keys] of flat) {
    const range = sectionRange(name);
    if (!range) {
      appendSections.push(
        `[${name}]`,
        ...[...keys].map(([k, v]) => `${k} = ${v}`)
      );
      continue;
    }
    const [start, end] = range;
    const inserts: string[] = [];
    for (const [key, value] of keys) {
      const assignment = new RegExp(`^(\\s*)${key}\\s*=`);
      let replaced = false;
      for (let i = start; i < end; i++) {
        const m = content(lines[i]).match(assignment);
        if (m) {
          lines[i] = finish(`${m[1]}${key} = ${value}`, i);
          replaced = true;
          break;
        }
      }
      if (!replaced) {
        inserts.push(`${key} = ${value}`);
      }
    }
    if (inserts.length > 0) {
      let at = start;
      for (let i = start; i < end; i++) {
        if (content(lines[i]).trim() !== '') {
          at = i + 1;
        }
      }
      lines.splice(at, 0, ...inserts.map(l => finish(l, at)));
    }
  }
  if (appendSections.length > 0) {
    while (lines.length > 0 && content(lines[lines.length - 1]).trim() === '') {
      lines.pop();
    }
    const eol = crlf ? '\r' : '';
    lines.push(
      ...['', ...appendSections, ''].map(l => (l === '' ? l : `${l}${eol}`))
    );
  }

  const result = lines.join('\n');
  // Full-document check, not just the patched keys: a line that happened to
  // sit inside a multi-line string could have been rewritten, which only a
  // comparison of every value catches.
  try {
    if (isDeepStrictEqual(tomlParse(result), deepMerge(parsed, patch))) {
      return result;
    }
  } catch {
    // fall through to the legacy rewrite
  }
  return legacy();
}

export const MANAGED_BLOCK_START = '# >>> vercel ai-gateway >>>';
export const MANAGED_BLOCK_END = '# <<< vercel ai-gateway <<<';

export function upsertManagedBlock(
  current: string | null,
  body: string
): string {
  const block = `${MANAGED_BLOCK_START}\n${body}\n${MANAGED_BLOCK_END}`;
  const existing = current ?? '';
  const start = existing.indexOf(MANAGED_BLOCK_START);
  const end = existing.indexOf(MANAGED_BLOCK_END);
  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start);
    const after = existing.slice(end + MANAGED_BLOCK_END.length);
    return `${before}${block}${after}`;
  }
  if (existing.length === 0) {
    return `${block}\n`;
  }
  // Keep one blank line between existing content and the appended block so
  // it reads as its own section rather than a tail of the previous one.
  const prefix = existing.endsWith('\n\n')
    ? ''
    : existing.endsWith('\n')
      ? '\n'
      : '\n\n';
  return `${existing}${prefix}${block}\n`;
}

export async function backupFile(path: string): Promise<string> {
  const backupPath = `${path}.bak`;
  await copyFile(path, backupPath);
  return backupPath;
}

export async function writeConfigFile(
  path: string,
  content: string,
  mode?: number
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, mode === undefined ? 'utf8' : { mode });
}
