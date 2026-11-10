import {
  ReadableStream,
  type ReadableStreamDefaultController,
} from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Client from '../../../../src/util/client';
import { readNdjson } from '../../../../src/util/ci/ndjson';

function createStream() {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
    cancel,
  });
  const fetch = vi.fn().mockResolvedValue(new Response(body));
  return {
    client: { fetch } as unknown as Client,
    fetch,
    cancel,
    write(line: string) {
      controller.enqueue(new TextEncoder().encode(line));
    },
    close() {
      controller.close();
    },
    fail(error: Error) {
      controller.error(error);
    },
  };
}

describe('readNdjson', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses lines, skips whitespace, and reads the final unterminated line', async () => {
    const stream = createStream();
    stream.write('\n  \n{"value":1}\n{"value":');
    stream.write('2}');
    stream.close();
    const values = [];
    for await (const value of readNdjson(stream.client, '/stream', {
      accountId: 'team_123',
    })) {
      values.push(value);
    }
    expect(values).toEqual([{ value: 1 }, { value: 2 }]);
    expect(stream.fetch).toHaveBeenCalledWith('/stream', {
      json: false,
      accountId: 'team_123',
      signal: undefined,
    });
    expect(stream.cancel).not.toHaveBeenCalled();
  });

  it('closes the body before returning early on a terminal tree and aborting fetch', async () => {
    const stream = createStream();
    const controller = new AbortController();
    stream.write('{"type":"tree","terminal":true}\n');
    for await (const event of readNdjson<{ terminal: boolean }>(
      stream.client,
      '/stream',
      { signal: controller.signal }
    )) {
      if (event.terminal) break;
    }
    expect(stream.cancel).toHaveBeenCalledTimes(1);
    controller.abort();
    // Allow asynchronous stream error/close events to surface in the test runner.
    await new Promise(resolve => setImmediate(resolve));
    expect(stream.cancel).toHaveBeenCalledTimes(1);
  });

  it('aborts a stalled read at the timeout and closes the body', async () => {
    vi.useFakeTimers();
    const stream = createStream();
    const controller = new AbortController();
    const iterator = readNdjson(stream.client, '/stream', {
      signal: controller.signal,
    });
    const rejected = expect(iterator.next()).rejects.toMatchObject({
      name: 'AbortError',
    });
    setTimeout(() => controller.abort(), 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(stream.cancel).toHaveBeenCalledTimes(1);
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
  });

  it('closes the body when the signal was already aborted', async () => {
    const stream = createStream();
    const controller = new AbortController();
    controller.abort();
    await expect(
      readNdjson(stream.client, '/stream', {
        signal: controller.signal,
      }).next()
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(stream.cancel).toHaveBeenCalledTimes(1);
  });

  it('preserves malformed JSON errors while closing the body', async () => {
    const stream = createStream();
    stream.write('{not json}\n');
    const iterator = readNdjson(stream.client, '/stream');
    await expect(iterator.next()).rejects.toBeInstanceOf(SyntaxError);
    expect(stream.cancel).toHaveBeenCalledTimes(1);
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
  });

  it('propagates a network error while waiting for the next line', async () => {
    const stream = createStream();
    stream.write('{"value":1}\n');
    const iterator = readNdjson(stream.client, '/stream');
    expect(await iterator.next()).toEqual({
      done: false,
      value: { value: 1 },
    });
    const error = new Error('Connection reset');
    const rejected = expect(iterator.next()).rejects.toBe(error);
    stream.fail(error);
    await rejected;
    expect(await iterator.next()).toEqual({ done: true, value: undefined });
  });

  it('observes network errors while paused at a yield and propagates them on resume', async () => {
    const stream = createStream();
    stream.write('{"value":1}\n');
    const iterator = readNdjson(stream.client, '/stream');
    await iterator.next();
    const error = new Error('Connection reset while paused');
    stream.fail(error);
    await new Promise(resolve => setImmediate(resolve));
    await expect(iterator.next()).rejects.toBe(error);
  });

  it('reads a pretty-printed application/json fallback as one envelope', async () => {
    const payload = {
      lines: [{ timestamp: 1, level: 'info', message: 'fallback' }],
    };
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload, null, 2), {
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    );
    const values = [];
    for await (const value of readNdjson(
      { fetch } as unknown as Client,
      '/stream'
    ))
      values.push(value);
    expect(values).toEqual([payload]);
  });

  it('rejects oversized JSON snapshots instead of retaining unbounded replay data', async () => {
    const stream = createStream();
    stream.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ lines: ['x'.repeat(8 * 1024 * 1024)] }), {
        headers: { 'content-type': 'application/json' },
      })
    );
    await expect(readNdjson(stream.client, '/stream').next()).rejects.toThrow(
      'exceeds 8 MiB'
    );
    stream.close();
  });

  it.each([
    'terminated',
    'unterminated',
    'multibyte',
  ])('rejects an oversized %s frame before parsing and cancels the body', async kind => {
    const stream = createStream();
    const iterator = readNdjson(stream.client, '/stream');
    const rejected = expect(iterator.next()).rejects.toThrow('exceeds 8 MiB');
    if (kind === 'multibyte') {
      stream.write('"' + '😀'.repeat(2 * 1024 * 1024));
    } else {
      stream.write('"' + 'x'.repeat(4 * 1024 * 1024));
      stream.write(
        'x'.repeat(4 * 1024 * 1024) + (kind === 'terminated' ? '"\n' : '')
      );
    }
    await rejected;
    expect(stream.cancel).toHaveBeenCalledTimes(1);
  });

  it('resets the frame budget between records', async () => {
    const stream = createStream();
    stream.write(`"${'x'.repeat(5 * 1024 * 1024)}"\n`);
    stream.write(`"${'y'.repeat(5 * 1024 * 1024)}"\n`);
    stream.close();
    const sizes = [];
    for await (const value of readNdjson<string>(stream.client, '/stream')) {
      sizes.push(value.length);
    }
    expect(sizes).toEqual([5 * 1024 * 1024, 5 * 1024 * 1024]);
  });

  it('preserves fetch failures', async () => {
    const stream = createStream();
    const error = new Error('Request failed');
    stream.fetch.mockRejectedValueOnce(error);
    await expect(readNdjson(stream.client, '/stream').next()).rejects.toBe(
      error
    );
    stream.close();
  });
});
