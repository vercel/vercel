import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { SessionMigrationPlan } from '../types';
import { pathExists, publishNoClobber } from '../config-files';

// Copies Claude Desktop's per-identity session records into the gateway
// (`Claude-3p`) identity, rewriting `model` to its gateway id; originals are
// never touched. The 3p store only exists after the first gateway launch.

// Real session records run 1-130 KiB; anything past 1 MiB is treated as
// corrupt and skipped rather than copied.
const MAX_RECORD_BYTES = 1024 * 1024;

function codeSpan(value: string): string {
  return `\`${value.replace(/[`\r\n]/g, '')}\``;
}
const RECORD_PATTERN = /\.json$/;

interface PlannedCopy {
  source: string;
  destination: string;
  bytes: number;
}

export function claudeAppSupportRoot(home: string): string {
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support');
  }
  if (process.platform === 'win32') {
    return process.env.APPDATA || join(home, 'AppData', 'Roaming');
  }
  return join(home, '.config');
}

// `claude-opus-4-8` -> `anthropic/claude-opus-4-8`; gateway ids pass through.
export function toGatewayModelId(model: string): string {
  return model.includes('/') ? model : `anthropic/${model}`;
}

async function listSubdirectories(path: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

// Most recently used identity dir; new session records bump its mtime.
async function findDestinationIdentity(root: string): Promise<string | null> {
  let best: { path: string; mtime: number } | null = null;
  for (const account of await listSubdirectories(root)) {
    for (const org of await listSubdirectories(join(root, account))) {
      const path = join(root, account, org);
      try {
        const stat = await fs.stat(path);
        if (!best || stat.mtimeMs > best.mtime) {
          best = { path, mtime: stat.mtimeMs };
        }
      } catch {}
    }
  }
  return best?.path ?? null;
}

async function readRecord(
  path: string
): Promise<{ record: Record<string, unknown>; bytes: number } | null> {
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(path);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size > MAX_RECORD_BYTES) return null;
  try {
    const raw = await fs.readFile(path, 'utf8');
    const record: unknown = JSON.parse(raw);
    if (
      typeof record !== 'object' ||
      record === null ||
      Array.isArray(record)
    ) {
      return null;
    }
    return { record: record as Record<string, unknown>, bytes: stat.size };
  } catch {
    return null;
  }
}

async function writeRecordNoClobber(
  destination: string,
  contents: string
): Promise<'copied' | 'skipped'> {
  if (await pathExists(destination)) return 'skipped';
  await fs.mkdir(dirname(destination), { recursive: true });
  const temp = join(dirname(destination), `.migrate-${randomUUID()}.tmp`);
  await fs.writeFile(temp, contents, { mode: 0o600 });
  return (await publishNoClobber(temp, destination)) ? 'copied' : 'skipped';
}

export async function planClaudeDesktopSessionMigration(
  home: string,
  appSupportRoot: string = claudeAppSupportRoot(home)
): Promise<SessionMigrationPlan | null> {
  const subscriptionRoot = join(
    appSupportRoot,
    'Claude',
    'claude-code-sessions'
  );
  const gatewayRoot = join(appSupportRoot, 'Claude-3p', 'claude-code-sessions');

  const destinationDir = await findDestinationIdentity(gatewayRoot);
  if (!destinationDir) return null;

  const copies: PlannedCopy[] = [];
  let totalBytes = 0;
  for (const account of await listSubdirectories(subscriptionRoot)) {
    for (const org of await listSubdirectories(
      join(subscriptionRoot, account)
    )) {
      const identityDir = join(subscriptionRoot, account, org);
      let names: string[];
      try {
        names = await fs.readdir(identityDir);
      } catch {
        continue;
      }
      for (const name of names) {
        if (!RECORD_PATTERN.test(name)) continue;
        const source = join(identityDir, name);
        const destination = join(destinationDir, name);
        if (await pathExists(destination)) continue;
        const read = await readRecord(source);
        if (!read) continue;
        copies.push({ source, destination, bytes: read.bytes });
        totalBytes += read.bytes;
      }
    }
  }
  if (copies.length === 0) return null;

  return {
    label: 'Claude Desktop sessions',
    itemCount: copies.length,
    totalBytes,
    sourceRoots: [subscriptionRoot],
    destinationRoots: [destinationDir],
    prompt: [
      `Copy the ${copies.length} Claude Desktop session record${
        copies.length === 1 ? '' : 's'
      } (per-session \`.json\` files) under ${codeSpan(subscriptionRoot)} into ${codeSpan(destinationDir)}, keeping each filename.`,
      'In each copy, rewrite the top-level `model` field to its AI Gateway id by prefixing `anthropic/` when the value has no provider prefix (e.g. `claude-opus-4-8` → `anthropic/claude-opus-4-8`); keep any suffix such as `[1m]` intact. Leave every other field unchanged.',
      'Use atomic, no-clobber writes with mode 0600; skip records whose destination already exists. Never move, edit, delete, or overwrite an original record.',
    ],
    async apply() {
      let copied = 0;
      let skipped = 0;
      const errors: string[] = [];
      for (const copy of copies) {
        try {
          const read = await readRecord(copy.source);
          if (!read) {
            skipped += 1;
            continue;
          }
          const record = { ...read.record };
          if (typeof record.model === 'string') {
            record.model = toGatewayModelId(record.model);
          }
          const outcome = await writeRecordNoClobber(
            copy.destination,
            `${JSON.stringify(record)}\n`
          );
          if (outcome === 'copied') copied += 1;
          else skipped += 1;
        } catch (error) {
          errors.push(
            `${copy.source}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
      return errors.length > 0
        ? { copied, skipped, errors }
        : { copied, skipped };
    },
  };
}
