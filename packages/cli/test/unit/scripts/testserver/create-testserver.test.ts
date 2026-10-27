import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTestserver,
  isConnectFailure,
} from '../../../../scripts/testserver/create-testserver.mjs';

const scriptPath = resolve(
  __dirname,
  '../../../../scripts/testserver/create-testserver.mjs'
);

const TOKEN = 'oidc-token';
const CONFIG_EVENT = {
  testserverUrl: 'https://sandbox.example',
  dynamodbAdminUrl: 'https://dynamo.example',
  logsUrl: 'https://logs.example',
  blobUrl: 'https://blob.example',
  blobPath: 'abc',
  config: {},
};

const encoder = new TextEncoder();
const sse = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;

// The shape undici rejects with: a TypeError whose cause carries the code.
const fetchFailed = (code: string) =>
  new TypeError('fetch failed', {
    cause: Object.assign(new Error(`${code} failure`), { code }),
  });

// A stream that emits `chunks`, then either closes, errors, or stays open.
function streamResponse(
  chunks: string[],
  end: 'close' | 'error' | 'hang' = 'close'
) {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (end === 'close') controller.close();
      if (end === 'error') controller.error(new Error('socket hang up'));
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    response: new Response(body, { status: 200 }),
    wasCancelled: () => cancelled,
  };
}

describe('createTestserver()', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns on the config event while the stream stays open', async () => {
    const { response, wasCancelled } = streamResponse(
      [sse({ message: 'starting' }), sse(CONFIG_EVENT)],
      'hang'
    );
    fetchMock.mockResolvedValueOnce(response);

    const config = await createTestserver({ trustedOidcToken: TOKEN });

    expect(config.testserver).toBe(CONFIG_EVENT.testserverUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wasCancelled()).toBe(true);
  });

  it('does not retry when the stream drops after a response', async () => {
    fetchMock.mockResolvedValue(
      streamResponse([sse({ message: 'starting' })], 'error').response
    );

    await expect(createTestserver({ trustedOidcToken: TOKEN })).rejects.toThrow(
      /socket hang up/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the stream ends without a config', async () => {
    fetchMock.mockResolvedValue(
      streamResponse([sse({ message: 'starting' })]).response
    );

    await expect(createTestserver({ trustedOidcToken: TOKEN })).rejects.toThrow(
      /ended without a sandbox config/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a server error event', async () => {
    fetchMock.mockResolvedValue(
      streamResponse([sse({ error: 'boom' })]).response
    );

    await expect(createTestserver({ trustedOidcToken: TOKEN })).rejects.toThrow(
      /Testserver create failed: boom/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([302, 401, 403, 500, 504])('does not retry HTTP %i', async status => {
    fetchMock.mockResolvedValue(
      new Response('nope', { status, headers: { location: '/sso' } })
    );

    await expect(
      createTestserver({ trustedOidcToken: TOKEN })
    ).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    'ENOTFOUND',
    'ECONNREFUSED',
    'UND_ERR_CONNECT_TIMEOUT',
  ])('retries when the connection failed with %s', async code => {
    fetchMock
      .mockRejectedValueOnce(fetchFailed(code))
      .mockResolvedValueOnce(streamResponse([sse(CONFIG_EVENT)]).response);

    const config = await createTestserver({ trustedOidcToken: TOKEN });

    expect(config.testserver).toBe(CONFIG_EVENT.testserverUrl);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after three failed connects', async () => {
    fetchMock.mockRejectedValue(fetchFailed('ECONNREFUSED'));

    await expect(createTestserver({ trustedOidcToken: TOKEN })).rejects.toThrow(
      /fetch failed/
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    [
      'a socket closed after the request was sent',
      fetchFailed('UND_ERR_SOCKET'),
    ],
    [
      'a timeout before headers',
      // What AbortSignal.timeout() rejects with (a DOMException in Node).
      Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      }),
    ],
    [
      'an invalid header value',
      new TypeError('Headers.append: "a\nb" is an invalid header value.'),
    ],
  ])('does not retry %s', async (_label, error) => {
    fetchMock.mockRejectedValue(error);

    await expect(createTestserver({ trustedOidcToken: TOKEN })).rejects.toBe(
      error
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('isConnectFailure()', () => {
  it('matches the AggregateError cause from a multi-address connect', () => {
    const cause = Object.assign(new AggregateError([], ''), {
      code: 'ECONNREFUSED',
    });
    expect(isConnectFailure(new TypeError('fetch failed', { cause }))).toBe(
      true
    );
  });

  it('ignores connect codes on errors that are not fetch TypeErrors', () => {
    const err = Object.assign(new Error('write failed'), {
      cause: { code: 'ENOTFOUND' },
    });
    expect(isConnectFailure(err)).toBe(false);
  });
});

describe('running the script', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'create-testserver-main-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // An unknown argument makes the main block fail before any network call.
  // Exit 0 with no output means the main block never ran.
  const runWithBadArg = (path: string) =>
    spawnSync(process.execPath, [path, '--bogus'], { encoding: 'utf8' });

  it('runs the main block when invoked by its real path', () => {
    const result = runWithBadArg(scriptPath);
    expect(result.stderr).toContain('Unknown argument: --bogus');
    expect(result.status).toBe(1);
  });

  it('runs the main block when invoked through a symlink', () => {
    const link = join(dir, 'create-testserver.mjs');
    symlinkSync(scriptPath, link);
    const result = runWithBadArg(link);
    expect(result.stderr).toContain('Unknown argument: --bogus');
    expect(result.status).toBe(1);
  });
});
