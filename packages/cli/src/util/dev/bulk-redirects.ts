import { lstat, readdir, readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { parse as parseUrl } from 'node:url';

const MAX_REDIRECTS = 1_000_000;
const MAX_FILES = 100;
const MAX_URL_LENGTH = 2048;
const VALID_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const SUPPORTED_EXTENSIONS = new Set(['.csv', '.json', '.jsonl']);

export interface BulkRedirectMatch {
  destination: string;
  statusCode: number;
  preserveQueryParams: boolean;
}

export class BulkRedirectTable {
  private readonly caseSensitiveByHostPath = new Map<
    string,
    BulkRedirectMatch
  >();
  private readonly caseInsensitiveByHostPath = new Map<
    string,
    BulkRedirectMatch
  >();
  private readonly caseSensitiveByPath = new Map<string, BulkRedirectMatch>();
  private readonly caseInsensitiveByPath = new Map<string, BulkRedirectMatch>();

  get size(): number {
    return (
      this.caseSensitiveByHostPath.size +
      this.caseInsensitiveByHostPath.size +
      this.caseSensitiveByPath.size +
      this.caseInsensitiveByPath.size
    );
  }

  add(redirect: {
    source: string;
    destination: string;
    statusCode: number;
    caseSensitive: boolean;
    preserveQueryParams: boolean;
  }): void {
    const { host, pathname } = parseSource(redirect.source);
    const stored: BulkRedirectMatch = {
      destination: redirect.destination,
      statusCode: redirect.statusCode,
      preserveQueryParams: redirect.preserveQueryParams,
    };

    if (host) {
      const key = hostPathKey(host, pathname);
      if (redirect.caseSensitive) {
        this.caseSensitiveByHostPath.set(key, stored);
      } else {
        this.caseInsensitiveByHostPath.set(key.toLowerCase(), stored);
      }
      return;
    }

    if (redirect.caseSensitive) {
      this.caseSensitiveByPath.set(pathname, stored);
    } else {
      this.caseInsensitiveByPath.set(pathname.toLowerCase(), stored);
    }
  }

  lookup(pathname: string, host?: string): BulkRedirectMatch | undefined {
    const hostname = host ? hostnameFromHostHeader(host) : '';

    if (hostname) {
      const hostKey = hostPathKey(hostname, pathname);
      const hostMatch =
        this.caseSensitiveByHostPath.get(hostKey) ||
        this.caseInsensitiveByHostPath.get(hostKey.toLowerCase());
      if (hostMatch) {
        return hostMatch;
      }
    }

    return (
      this.caseSensitiveByPath.get(pathname) ||
      this.caseInsensitiveByPath.get(pathname.toLowerCase())
    );
  }
}

export interface LoadBulkRedirectsResult {
  table: BulkRedirectTable;
  redirectCount: number;
  fileCount: number;
  warnings: string[];
}

export async function getBulkRedirectsSignature(
  cwd: string,
  bulkRedirectsPath?: string | null
): Promise<string> {
  if (!bulkRedirectsPath) {
    return '';
  }

  const resolved = resolveBulkRedirectsPath(cwd, bulkRedirectsPath);
  if (!resolved) {
    return `invalid:${bulkRedirectsPath}`;
  }

  try {
    const stats = await stat(resolved);
    if (stats.isFile()) {
      return `file:${resolved}:${stats.mtimeMs}:${stats.size}`;
    }
    if (!stats.isDirectory()) {
      return `other:${resolved}:${stats.mtimeMs}`;
    }

    const files = await listRedirectFiles(resolved);
    const parts = await Promise.all(
      files.map(async file => {
        try {
          const fileStats = await stat(file);
          return `${file}:${fileStats.mtimeMs}:${fileStats.size}`;
        } catch {
          return `${file}:missing`;
        }
      })
    );
    return `dir:${resolved}:${parts.join('|')}`;
  } catch {
    return `missing:${resolved}`;
  }
}

export async function loadBulkRedirects(
  cwd: string,
  bulkRedirectsPath: string
): Promise<LoadBulkRedirectsResult> {
  const warnings: string[] = [];
  const table = new BulkRedirectTable();

  const resolved = resolveBulkRedirectsPath(cwd, bulkRedirectsPath);
  if (!resolved) {
    warnings.push(
      `Skipping bulk redirects path "${bulkRedirectsPath}" because it resolves outside the project directory.`
    );
    return { table, redirectCount: 0, fileCount: 0, warnings };
  }

  let files: string[];
  try {
    const stats = await stat(resolved);
    if (stats.isDirectory()) {
      files = await listRedirectFiles(resolved);
      if (files.length > MAX_FILES) {
        warnings.push(
          `Bulk redirects directory "${bulkRedirectsPath}" has ${files.length} files; only the first ${MAX_FILES} will be used.`
        );
        files = files.slice(0, MAX_FILES);
      }
    } else if (stats.isFile()) {
      const ext = extname(resolved).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        warnings.push(
          `Bulk redirects file "${bulkRedirectsPath}" must be a .csv, .json, or .jsonl file.`
        );
        return { table, redirectCount: 0, fileCount: 0, warnings };
      }
      files = [resolved];
    } else {
      warnings.push(
        `Bulk redirects path "${bulkRedirectsPath}" is not a file or directory.`
      );
      return { table, redirectCount: 0, fileCount: 0, warnings };
    }
  } catch (err: unknown) {
    if (isNotFound(err)) {
      warnings.push(
        `Bulk redirects path "${bulkRedirectsPath}" was not found.`
      );
      return { table, redirectCount: 0, fileCount: 0, warnings };
    }
    throw err;
  }

  let redirectCount = 0;
  for (const file of files) {
    if (redirectCount >= MAX_REDIRECTS) {
      warnings.push(
        `Bulk redirects limit of ${MAX_REDIRECTS} reached; remaining entries were skipped.`
      );
      break;
    }

    const remaining = MAX_REDIRECTS - redirectCount;
    const parsed = await parseRedirectFile(file, remaining, warnings, cwd);
    for (const redirect of parsed) {
      table.add(redirect);
      redirectCount++;
    }
  }

  const duplicateCount = redirectCount - table.size;
  if (duplicateCount > 0) {
    warnings.push(
      `Bulk redirects contain ${duplicateCount} duplicate ${
        duplicateCount === 1 ? 'source' : 'sources'
      }; the last occurrence wins.`
    );
  }

  return {
    table,
    redirectCount,
    fileCount: files.length,
    warnings,
  };
}

export function resolveBulkRedirect(
  table: BulkRedirectTable,
  reqUrl: string,
  host?: string
): { location: string; statusCode: number } | undefined {
  const parsed = parseUrl(reqUrl);
  const match = table.lookup(parsed.pathname || '/', host);
  if (!match) {
    return undefined;
  }

  let location = match.destination;
  if (match.preserveQueryParams && parsed.search) {
    location = appendQueryParams(location, parsed.search);
  }

  return { location, statusCode: match.statusCode };
}

export function appendQueryParams(destination: string, search: string): string {
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (!query) {
    return destination;
  }
  return destination.includes('?')
    ? `${destination}&${query}`
    : `${destination}?${query}`;
}

export function resolveBulkRedirectsPath(
  cwd: string,
  bulkRedirectsPath: string
): string | null {
  const projectRoot = resolve(cwd);
  const resolved = resolve(projectRoot, bulkRedirectsPath);
  const relativeFromRoot = relative(projectRoot, resolved);
  if (relativeFromRoot.startsWith('..') || isAbsolute(relativeFromRoot)) {
    return null;
  }
  return resolved;
}

async function listRedirectFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  await walk(dir, files);
  files.sort();
  return files;
}

async function walk(dir: string, files: string[]): Promise<void> {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = await lstat(fullPath);
    if (stats.isDirectory()) {
      await walk(fullPath, files);
    } else if (
      stats.isFile() &&
      SUPPORTED_EXTENSIONS.has(extname(fullPath).toLowerCase())
    ) {
      files.push(fullPath);
    }
  }
}

async function parseRedirectFile(
  file: string,
  remaining: number,
  warnings: string[],
  cwd: string
): Promise<
  Array<{
    source: string;
    destination: string;
    statusCode: number;
    caseSensitive: boolean;
    preserveQueryParams: boolean;
  }>
> {
  const rel = relative(cwd, file) || file;
  const ext = extname(file).toLowerCase();
  let content: string;
  try {
    content = stripBom(await readFile(file, 'utf8'));
  } catch (err: unknown) {
    warnings.push(
      `Failed to read bulk redirects file "${rel}": ${errorMessage(err)}`
    );
    return [];
  }

  try {
    if (ext === '.csv') {
      return parseCsvRedirects(content, remaining, warnings, rel);
    }
    if (ext === '.jsonl') {
      return parseJsonlRedirects(content, remaining, warnings, rel);
    }
    return parseJsonRedirects(content, remaining, warnings, rel);
  } catch (err: unknown) {
    warnings.push(
      `Failed to parse bulk redirects file "${rel}": ${errorMessage(err)}`
    );
    return [];
  }
}

function parseJsonRedirects(
  content: string,
  remaining: number,
  warnings: string[],
  rel: string
) {
  const parsed: unknown = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    warnings.push(
      `Bulk redirects file "${rel}" must contain a JSON array of redirects.`
    );
    return [];
  }
  return normalizeRedirects(parsed, remaining, warnings, rel);
}

function parseJsonlRedirects(
  content: string,
  remaining: number,
  warnings: string[],
  rel: string
) {
  const rows: unknown[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }
    try {
      rows.push(JSON.parse(line));
    } catch {
      warnings.push(`Skipping invalid JSONL in "${rel}" at line ${i + 1}.`);
    }
  }
  return normalizeRedirects(rows, remaining, warnings, rel);
}

const CSV_HEADER_ALIASES: Record<string, string> = {
  source: 'source',
  destination: 'destination',
  permanent: 'permanent',
  statuscode: 'statusCode',
  casesensitive: 'caseSensitive',
  preservequeryparams: 'preserveQueryParams',
};

function parseCsvRedirects(
  content: string,
  remaining: number,
  warnings: string[],
  rel: string
) {
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    warnings.push(`Bulk redirects CSV "${rel}" is empty.`);
    return [];
  }

  const headers = parseCsvLine(lines[0]).map(
    header => CSV_HEADER_ALIASES[header.trim().toLowerCase()]
  );
  if (!headers.includes('source') || !headers.includes('destination')) {
    warnings.push(
      `Bulk redirects CSV "${rel}" must have "source" and "destination" columns.`
    );
    return [];
  }

  const rows: unknown[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let col = 0; col < headers.length; col++) {
      const header = headers[col];
      if (header) {
        row[header] = values[col] ?? '';
      }
    }
    rows.push(row);
  }
  return normalizeRedirects(rows, remaining, warnings, rel);
}

function normalizeRedirects(
  rows: unknown[],
  remaining: number,
  warnings: string[],
  rel: string
) {
  const redirects: Array<{
    source: string;
    destination: string;
    statusCode: number;
    caseSensitive: boolean;
    preserveQueryParams: boolean;
  }> = [];

  for (let i = 0; i < rows.length; i++) {
    if (redirects.length >= remaining) {
      warnings.push(
        `Bulk redirects limit of ${MAX_REDIRECTS} reached while reading "${rel}"; remaining entries were skipped.`
      );
      break;
    }

    const row = rows[i];
    if (!row || typeof row !== 'object') {
      warnings.push(`Skipping invalid redirect in "${rel}" at index ${i}.`);
      continue;
    }

    const record = row as Record<string, unknown>;
    const source = asTrimmedString(record.source);
    const destination = asTrimmedString(record.destination);

    if (!source || !destination) {
      warnings.push(
        `Skipping redirect in "${rel}" at index ${i}: source and destination are required.`
      );
      continue;
    }

    if (source.length > MAX_URL_LENGTH || destination.length > MAX_URL_LENGTH) {
      warnings.push(
        `Skipping redirect in "${rel}" at index ${i}: source and destination must be at most ${MAX_URL_LENGTH} characters.`
      );
      continue;
    }

    let statusCode: number;
    if (record.statusCode !== undefined && record.statusCode !== '') {
      const parsedStatus = parseStatusCode(record.statusCode);
      if (parsedStatus === undefined) {
        warnings.push(
          `Skipping redirect in "${rel}" at index ${i}: statusCode must be one of ${[...VALID_STATUS_CODES].join(', ')}.`
        );
        continue;
      }
      statusCode = parsedStatus;
    } else {
      const permanent = parseBoolean(record.permanent) ?? false;
      statusCode = permanent ? 308 : 307;
    }

    redirects.push({
      source,
      destination,
      statusCode,
      caseSensitive: parseBoolean(record.caseSensitive) ?? false,
      preserveQueryParams: parseBoolean(record.preserveQueryParams) ?? false,
    });
  }

  return redirects;
}

function parseSource(source: string): {
  host: string | null;
  pathname: string;
} {
  if (/^https?:\/\//i.test(source)) {
    try {
      const parsed = new URL(source);
      return {
        host: parsed.hostname.toLowerCase(),
        pathname: parsed.pathname || '/',
      };
    } catch {
      return { host: null, pathname: source };
    }
  }
  return { host: null, pathname: source || '/' };
}

function hostPathKey(host: string, pathname: string): string {
  return `${host}\0${pathname}`;
}

export function hostnameFromHostHeader(hostHeader: string): string {
  const trimmed = hostHeader.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    return end === -1
      ? trimmed.toLowerCase()
      : trimmed.slice(1, end).toLowerCase();
  }
  const colon = trimmed.lastIndexOf(':');
  if (colon !== -1 && trimmed.indexOf(':') === colon) {
    return trimmed.slice(0, colon).toLowerCase();
  }
  return trimmed.toLowerCase();
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 't' || normalized === 'true') {
    return true;
  }
  if (normalized === 'f' || normalized === 'false') {
    return false;
  }
  return undefined;
}

function parseStatusCode(value: unknown): number | undefined {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : NaN;
  return VALID_STATUS_CODES.has(n) ? n : undefined;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'ENOENT'
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
