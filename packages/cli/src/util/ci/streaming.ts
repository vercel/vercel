import type { Writable } from 'node:stream';
import type Client from '../client';
import type { CiLogLine } from './types';

export class CiStreamOutputError extends Error {}
export class CiReplayLimitError extends Error {}

/** Stop consuming remote records until stdout can accept another write. */
export async function writeCiOutput(
  stream: Writable,
  text: string
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      stream.removeListener('drain', onDrain);
      stream.removeListener('error', onError);
      stream.removeListener('close', onClose);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new CiStreamOutputError('Failed to write task logs.'));
    };
    const onClose = () => {
      cleanup();
      reject(new CiStreamOutputError('Task log output closed.'));
    };
    stream.once('drain', onDrain);
    stream.once('error', onError);
    stream.once('close', onClose);
    if (stream.destroyed) return onClose();
    try {
      if (stream.write(text)) onDrain();
    } catch {
      onError();
    }
  });
}

/**
 * Full replay avoids exclusive timestamp filters dropping older late arrivals.
 * Counts preserve identical records, assuming each snapshot is an append-only
 * superset. No eviction: at 8 MiB of UTF-8 keys plus estimated entry overhead or
 * 50,000 distinct records, stop explicitly instead of silently losing records.
 * This is a state budget, not a guarantee about JavaScript heap usage or API
 * retention. Stable server record IDs/cursors are needed for that guarantee.
 */
export class CiLogReplay {
  private counts = new Map<string, number>();
  private bytes = 0;

  constructor(
    private readonly maxBytes = 8 * 1024 * 1024,
    private readonly maxKeys = 50_000
  ) {}

  begin() {
    const remaining = new Map(this.counts);
    return (line: CiLogLine): boolean => {
      const key = JSON.stringify([line.timestamp, line.level, line.message]);
      const count = remaining.get(key) ?? 0;
      if (count > 0) {
        remaining.set(key, count - 1);
        return false;
      }
      if (!this.counts.has(key)) {
        const bytes = Buffer.byteLength(key) + 128;
        if (
          this.bytes + bytes > this.maxBytes ||
          this.counts.size >= this.maxKeys
        ) {
          throw new CiReplayLimitError(
            'Stopped following task logs because full replay reached its memory limit. Fetch task logs without --follow.'
          );
        }
        this.bytes += bytes;
      }
      this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
      return true;
    };
  }
}

/**
 * Preserve shared error mapping, recovery metadata, and telemetry without
 * modifying the parent's errors.ts. Replace this adapter when that helper
 * supports a compact JSONL formatting option. Never mutate the real client.
 */
export async function reportCiStreamError(
  client: Client,
  asJson: boolean,
  report: (client: Client) => number
): Promise<number> {
  if (!asJson) return report(client);
  let payload = '';
  const reportingClient = new Proxy(client, {
    get(target, property) {
      if (property === 'nonInteractive') return true;
      if (property === 'stdout') {
        return {
          write: (text: string) => {
            payload += text;
            return true;
          },
        };
      }
      return Reflect.get(target, property, target);
    },
  });
  const code = report(reportingClient);
  if (payload) {
    await writeCiOutput(
      client.stdout,
      `${JSON.stringify(JSON.parse(payload))}\n`
    );
  }
  return code;
}
