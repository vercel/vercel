import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
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
  return `${tomlStringify(deepMerge(parsed, patch))}\n`;
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
