import { createHash, randomUUID } from 'node:crypto';
import { v5 as uuidv5, validate as uuidValidate } from 'uuid';
import { createReadStream, createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { SessionMigrationPlan } from '../types';
import { publishNoClobber } from '../config-files';

const ROLLOUT_PATTERN = /^rollout-.*\.jsonl(?:\.zst)?$/;
const MAX_METADATA_BYTES = 1024 * 1024;
type Metadata = {
  record: Record<string, unknown>;
  payload: Record<string, unknown>;
  id: string;
  delimiter: string;
  restOffset: number;
};
type SessionCopy = {
  source: string;
  destination: string;
  sourceId: string;
  destinationId: string;
  bytes: number;
  root: string;
};
function hasCode(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException).code === code;
}
async function readMeta(
  path: string,
  gateway = false
): Promise<Metadata | null> {
  const handle = await fs.open(path, 'r');
  const buffer = new Uint8Array(MAX_METADATA_BYTES + 1);
  let length = 0;
  let newline = -1;
  try {
    while (length < buffer.length && newline < 0) {
      const start = length;
      const read = await handle.read(
        buffer,
        start,
        buffer.length - start,
        start
      );
      if (read.bytesRead === 0) break;
      length += read.bytesRead;
      newline = buffer.indexOf(0x0a, start);
    }
  } finally {
    await handle.close();
  }
  if (newline < 0 && length > MAX_METADATA_BYTES)
    throw new Error(`${basename(path)} metadata exceeds 1 MiB`);
  const lineEnd = newline < 0 ? length : newline;
  const carriageReturn = buffer[lineEnd - 1] === 0x0d;
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(
      new TextDecoder().decode(
        buffer.subarray(0, carriageReturn ? lineEnd - 1 : lineEnd)
      )
    );
  } catch {
    return null;
  }
  const payload = record.payload as Record<string, unknown> | undefined;
  const id =
    typeof payload?.id === 'string'
      ? payload.id
      : typeof payload?.session_id === 'string'
        ? payload.session_id
        : '';
  if (
    record.type !== 'session_meta' ||
    !payload ||
    !uuidValidate(id) ||
    (typeof payload.session_id === 'string' && payload.session_id !== id) ||
    (payload.originator !== 'Codex Desktop' &&
      !(payload.originator == null && payload.source === 'vscode')) ||
    (gateway
      ? payload.model_provider !== 'vercel'
      : payload.model_provider === 'vercel')
  ) {
    return null;
  }
  return {
    record,
    payload,
    id,
    delimiter: newline < 0 ? '' : carriageReturn ? '\r\n' : '\n',
    restOffset: newline < 0 ? length : newline + 1,
  };
}
function codeSpan(value: string): string {
  return `\`${value.replace(/[`\r\n]/g, '')}\``;
}
async function findRollouts(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && ROLLOUT_PATTERN.test(entry.name))
        files.push(path);
    }
  }
  await visit(root);
  return files;
}
async function planCopy(
  path: string,
  root: string
): Promise<SessionCopy | null> {
  const metadata = await readMeta(path);
  const filename = basename(path);
  if (!metadata || !filename.toLowerCase().includes(metadata.id.toLowerCase()))
    return null;
  const destinationId = uuidv5(
    `vercel-ai-gateway/codex/${metadata.id.toLowerCase()}/vercel`,
    uuidv5.URL
  );
  const destination = join(
    dirname(path),
    filename.replace(new RegExp(metadata.id, 'i'), destinationId)
  );
  const item = {
    source: path,
    destination,
    sourceId: metadata.id,
    destinationId,
    bytes: (await fs.stat(path)).size,
    root,
  };
  try {
    await fs.stat(destination);
    await validateDestination(item);
    return null;
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error;
  }
  return item;
}
async function bodyHash(path: string, start: number): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path, { start }), hash);
  return hash.digest('hex');
}
async function validateDestination(item: SessionCopy): Promise<void> {
  const [source, destination] = await Promise.all([
    readMeta(item.source),
    readMeta(item.destination, true),
  ]);
  const bodies = await Promise.all([
    bodyHash(item.source, source?.restOffset ?? 0),
    bodyHash(item.destination, destination?.restOffset ?? 0),
  ]);
  const valid =
    source && destination?.id === item.destinationId && bodies[0] === bodies[1];
  if (!valid)
    throw new Error(
      `Existing destination ${basename(item.destination)} is invalid`
    );
}
async function copySession(item: SessionCopy): Promise<boolean> {
  const metadata = await readMeta(item.source);
  if (!metadata) throw new Error('Codex session metadata is no longer valid');
  if (metadata.id !== item.sourceId)
    throw new Error('Codex session metadata changed after planning');
  const updated = {
    ...metadata.record,
    payload: {
      ...metadata.payload,
      id: item.destinationId,
      session_id: item.destinationId,
      model_provider: 'vercel',
    },
  };
  const temporary = `${item.destination}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await fs.writeFile(
      temporary,
      `${JSON.stringify(updated)}${metadata.delimiter}`,
      { flag: 'wx', mode: 0o600 }
    );
    await pipeline(
      createReadStream(item.source, { start: metadata.restOffset }),
      createWriteStream(temporary, { flags: 'a', mode: 0o600 })
    );
    await fs.chmod(temporary, 0o600);
    if (await publishNoClobber(temporary, item.destination)) {
      return true;
    }
    await validateDestination(item);
    return false;
  } finally {
    await fs.unlink(temporary).catch(error => {
      if (!hasCode(error, 'ENOENT')) throw error;
    });
  }
}
export async function planCodexSessionMigration(
  home: string
): Promise<SessionMigrationPlan | null> {
  const codexHome = process.env.CODEX_HOME || join(home, '.codex');
  const roots = ['sessions', 'archived_sessions'].map(root =>
    join(codexHome, root)
  );
  const files: Array<{ path: string; root: string }> = [];
  for (const root of roots) {
    files.push(...(await findRollouts(root)).map(path => ({ path, root })));
  }
  if (files.some(file => file.path.endsWith('.jsonl.zst'))) {
    throw new Error(
      'Found compressed Codex sessions; decompress them first, or pass --no-session-migration to leave them unchanged'
    );
  }
  const copies: SessionCopy[] = [];
  for (const file of files) {
    const copy = await planCopy(file.path, file.root);
    if (copy) copies.push(copy);
  }
  if (copies.length === 0) return null;
  const sourceRoots = [...new Set(copies.map(copy => copy.root))];
  return {
    label: 'Codex Desktop sessions',
    itemCount: copies.length,
    totalBytes: copies.reduce((total, copy) => total + copy.bytes, 0),
    sourceRoots,
    destinationRoots: sourceRoots,
    prompt: [
      `Before changing the provider, copy the ${copies.length} top-level Codex Desktop rollout${copies.length === 1 ? '' : 's'} with a non-\`vercel\` provider under ${sourceRoots.map(codeSpan).join(', ')}. Do not copy subagent rollouts whose \`session_id\` differs from \`id\`.`,
      'For each copy, derive a deterministic UUID v5 using the URL namespace `6ba7b811-9dad-11d1-80b4-00c04fd430c8` and name `vercel-ai-gateway/codex/<source-id>/vercel`. Replace the filename UUID and `session_meta.payload.id`/`session_id`, set `model_provider` to `vercel`, and preserve every later JSONL byte.',
      'Use atomic, no-clobber writes with mode 0600; skip an existing deterministic destination only after validating its metadata and body. Never move, edit, delete, or overwrite an original session file.',
    ],
    async apply() {
      let copied = 0;
      let skipped = 0;
      const errors: string[] = [];
      for (const item of copies) {
        try {
          (await copySession(item)) ? copied++ : skipped++;
        } catch (error) {
          errors.push(
            `${basename(item.source)}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      return { copied, skipped, errors };
    },
  };
}
