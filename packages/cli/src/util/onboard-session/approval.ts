import { randomBytes } from 'node:crypto';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Why an operation is gated. Deliberately three classes only: every gate is
 * an interruption, and a gate that fires on routine commands trains the user
 * to approve without reading.
 */
export type GateClass = 'spend' | 'production' | 'remote-delete';

export const APPROVALS_DIRNAME = 'approvals';

const REQUEST_SUFFIX = '.request.json';
const RESPONSE_SUFFIX = '.response.json';

const DEFAULT_POLL_MS = 300;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

export interface ApprovalRequest {
  id: string;
  command: string;
  argv: string[];
  cwd: string;
  gate: GateClass;
  description: string;
  requestedAt: string;
}

export type ApprovalVerdict = 'approved' | 'denied' | 'timeout';

/** What the prompt handler returns; the instruction rides along on a denial. */
export interface ApprovalDecision {
  approved: boolean;
  /** The user's steering ("do X instead"), relayed to the agent verbatim. */
  instruction?: string;
}

export interface ApprovalResult {
  verdict: ApprovalVerdict;
  instruction?: string;
}

/**
 * Ask the supervising onboard process for the user's decision, from inside the
 * gated CLI invocation.
 *
 * The handshake is two files: this side writes `<id>.request.json` and polls
 * for `<id>.response.json`; onboard watches the directory, prompts the human,
 * and writes the response. Both writes go through a temp file and a rename so
 * the reader never sees half a JSON document. No answer within the timeout is a
 * denial — a gate that fails open is not a gate.
 */
export async function requestApproval(
  sessionDir: string,
  operation: Omit<ApprovalRequest, 'id' | 'requestedAt'>,
  options: { pollMs?: number; timeoutMs?: number } = {}
): Promise<ApprovalResult> {
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const dir = join(sessionDir, APPROVALS_DIRNAME);
  const id = `${Date.now()}-${process.pid}-${randomBytes(4).toString('hex')}`;
  const request: ApprovalRequest = {
    id,
    ...operation,
    requestedAt: new Date().toISOString(),
  };

  try {
    await mkdir(dir, { recursive: true });
    await writeAtomically(
      join(dir, `${id}${REQUEST_SUFFIX}`),
      JSON.stringify(request)
    );
  } catch {
    // The session directory is gone — the supervising process died. Deny.
    return { verdict: 'timeout' };
  }

  const responsePath = join(dir, `${id}${RESPONSE_SUFFIX}`);
  const deadline = Date.now() + timeoutMs;

  try {
    while (Date.now() < deadline) {
      try {
        const raw = await readFile(responsePath, 'utf-8');
        const response = JSON.parse(raw);
        if (response.approved === true) {
          return { verdict: 'approved' };
        }
        return {
          verdict: 'denied',
          ...(typeof response.instruction === 'string' &&
          response.instruction.length > 0
            ? { instruction: response.instruction }
            : {}),
        };
      } catch {
        // No response yet.
      }
      await sleep(pollMs);
    }
    return { verdict: 'timeout' };
  } finally {
    // Leave nothing behind either way; onboard also cleans the directory up.
    await rm(join(dir, `${id}${REQUEST_SUFFIX}`), { force: true }).catch(
      () => undefined
    );
    await rm(responsePath, { force: true }).catch(() => undefined);
  }
}

/**
 * Onboard's side of the handshake: polls the approvals directory, hands each
 * request to the prompt handler, and writes the verdict back. Requests are
 * handled strictly one at a time — two prompts interleaved on one terminal
 * answer neither.
 */
export class ApprovalWatcher {
  private timer: NodeJS.Timeout | undefined;
  private readonly handled = new Set<string>();
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly sessionDir: string,
    private readonly handler: (
      request: ApprovalRequest
    ) => Promise<ApprovalDecision>,
    private readonly pollMs: number = DEFAULT_POLL_MS
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.scan();
    }, this.pollMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Exposed for tests and for a final sweep before teardown. */
  async scan(): Promise<void> {
    const dir = join(this.sessionDir, APPROVALS_DIRNAME);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return; // No requests yet.
    }

    for (const entry of entries) {
      if (!entry.endsWith(REQUEST_SUFFIX)) continue;
      const id = entry.slice(0, -REQUEST_SUFFIX.length);
      if (this.handled.has(id)) continue;

      let request: ApprovalRequest;
      try {
        request = JSON.parse(await readFile(join(dir, entry), 'utf-8'));
      } catch {
        // Being written right now; picked up on the next tick.
        continue;
      }

      // Marked only after a successful parse, so a torn read retries.
      this.handled.add(id);
      this.queue = this.queue.then(() => this.respond(dir, id, request));
    }

    await this.queue;
  }

  private async respond(
    dir: string,
    id: string,
    request: ApprovalRequest
  ): Promise<void> {
    let decision: ApprovalDecision = { approved: false };
    try {
      decision = await this.handler(request);
    } catch {
      // A failed prompt is a denial, never an open gate.
    }
    try {
      await writeAtomically(
        join(dir, `${id}${RESPONSE_SUFFIX}`),
        JSON.stringify(decision)
      );
    } catch {
      // The requester times out and treats it as denied.
    }
  }
}

async function writeAtomically(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, contents);
  await rename(tmp, path);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
