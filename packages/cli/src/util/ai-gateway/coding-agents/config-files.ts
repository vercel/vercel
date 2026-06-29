import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parse as tomlParse, stringify as tomlStringify } from 'smol-toml';

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

export function mergeJson(current: string | null, patch: JsonObject): string {
  let parsed: JsonObject = {};
  if (current && current.trim()) {
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
    parsed = raw;
  }
  return `${JSON.stringify(deepMerge(parsed, patch), null, 2)}\n`;
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
  const prefix = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
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
