import { ReadableStream } from 'node:stream/web';
import type { KeyEvent } from '../../../../src/commands/agent/tui/ui/keys';
import type { Line } from '../../../../src/commands/agent/tui/ui/text';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { vi } from 'vitest';
import { plainText } from '../../../../src/commands/agent/tui/ui/text';
import output from '../../../../src/output-manager';
import Client from '../../../../src/util/client';
import { TelemetryEventStore } from '../../../../src/util/telemetry';

/** Split the body into awkward small chunks to exercise buffering. */
export function sseBody(text: string, size = 7): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size)
        controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    },
  });
}

export function fixture(name: string): string {
  return readFileSync(
    join(__dirname, '../../../fixtures/unit/commands/agent', name),
    'utf8'
  );
}

export interface Call {
  method: string;
  url: string;
  body?: any;
  headers: Headers;
}

/** A JSON response; Vercel CLI's `client.fetch` parses the body only with this content type. */
export const json =
  (body: unknown, status = 200) =>
  (): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

/** The signed-in user, which Vercel CLI's `getScope` always fetches. */
const defaultRoutes: Record<string, () => Response> = {
  'GET https://api.vercel.com/v2/user': () =>
    json({
      user: { id: 'user_1', username: 'me', email: 'me@example.com' },
    })(),
};

/** Route requests by `METHOD url-prefix`; unmatched requests get Vercel's 404. */
export function mockFetch(input: Record<string, () => Response>): {
  calls: Call[];
  fetch: typeof globalThis.fetch;
} {
  const routes = { ...input };
  for (const [key, route] of Object.entries(defaultRoutes))
    if (!Object.keys(routes).some(k => key.startsWith(k))) routes[key] = route;
  const calls: Call[] = [];
  const fetch = async (
    url: string | URL | Request,
    init: RequestInit = {}
  ): Promise<Response> => {
    const call: Call = {
      method: init.method ?? 'GET',
      url: String(url),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      headers: new Headers(
        init.headers as ConstructorParameters<typeof Headers>[0]
      ),
    };
    calls.push(call);
    const key = Object.keys(routes).find(k =>
      `${call.method} ${call.url}`.startsWith(k)
    );
    return key
      ? routes[key]!()
      : new Response('{"error":"Not found."}', { status: 404 });
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

export interface TestClientOptions {
  argv?: string[];
  fetch: typeof globalThis.fetch;
  cwd?: string;
  stdin?: string;
  tty?: boolean;
  nonInteractive?: boolean;
  currentTeam?: string;
}

/**
 * A real Vercel CLI `Client` with captured stdout/stderr. Requests go through `client.fetch` (auth,
 * retries, errors) to `options.fetch`, stubbed in as the global `fetch`.
 */
export function createTestClient(options: TestClientOptions): {
  client: Client;
  out: { stdout: string; stderr: string };
} {
  const out = { stdout: '', stderr: '' };
  const sink = (key: 'stdout' | 'stderr'): Writable & { isTTY?: boolean } =>
    Object.assign(
      new Writable({
        write(chunk, _encoding, done) {
          out[key] += String(chunk);
          done();
        },
      }),
      { isTTY: options.tty }
    );
  const stdin = Object.assign(
    Readable.from(options.stdin ? [options.stdin] : []),
    { isTTY: options.tty ?? options.stdin === undefined }
  );
  const client = new Client({
    argv: ['node', 'vercel', 'agent', ...(options.argv ?? [])],
    apiUrl: 'https://api.vercel.com',
    authConfig: { token: 'tok' },
    config: { currentTeam: options.currentTeam ?? 'team_1' },
    stdin: stdin as unknown as Client['stdin'],
    stdout: sink('stdout') as unknown as Client['stdout'],
    stderr: sink('stderr') as unknown as Client['stderr'],
    nonInteractive: options.nonInteractive ?? false,
    isAgent: false,
    telemetryEventStore: new TelemetryEventStore({
      isDebug: false,
      config: { enabled: false },
    }),
  });
  // Vercel CLI's `client.cwd` is the process working directory.
  client.cwd = options.cwd ?? mkdtempSync(join(tmpdir(), 'vercel-agent-'));
  vi.stubGlobal('fetch', options.fetch);
  output.initialize({
    stream: client.stderr as unknown as NodeJS.WriteStream,
    supportsHyperlink: false,
  });
  return { client, out };
}

/** A rendered frame as plain text, trailing spaces trimmed. */
export function plain(lines: Line[]): string {
  return lines.map(line => plainText(line).replace(/\s+$/, '')).join('\n');
}

export function key(name: string, mods: Partial<KeyEvent> = {}): KeyEvent {
  return {
    kind: 'key',
    name,
    ctrl: false,
    meta: false,
    shift: false,
    ...mods,
  };
}

export const char = (text: string, mods: Partial<KeyEvent> = {}): KeyEvent =>
  key('char', { text, ...mods });

export async function waitFor(
  check: () => boolean,
  timeout = 5000
): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout)
      throw new Error('Timed out waiting for condition');
    await new Promise(r => setTimeout(r, 5));
  }
}
