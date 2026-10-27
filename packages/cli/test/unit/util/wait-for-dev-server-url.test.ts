import { EventEmitter, once } from 'node:events';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForDevServerUrl } from '../../helpers/wait-for-prompt';
import { waitForPortToAccept } from '../../helpers/wait-for-port';
import type { CLIProcess } from '../../helpers/types';

function createProcess() {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  }) as unknown as CLIProcess;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('waitForDevServerUrl', () => {
  it('uses the advertised port rather than an occupied requested port', async () => {
    const occupied = http.createServer();
    const app = http.createServer((_req, res) =>
      res.end('<h1>custom hello</h1>')
    );
    try {
      occupied.listen(0, '127.0.0.1');
      await once(occupied, 'listening');
      app.listen(0, '127.0.0.1');
      await once(app, 'listening');
      const requestedPort = (occupied.address() as { port: number }).port;
      const actualPort = (app.address() as { port: number }).port;
      expect(actualPort).not.toBe(requestedPort);

      // The occupied IPv4 port is not accepting localhost's IPv6 connection,
      // matching CI's port fallback followed by a timeout on the old port.
      await expect(
        waitForPortToAccept(requestedPort, {
          host: '::1',
          timeout: 50,
          interval: 10,
        })
      ).rejects.toThrow('waiting for port');

      const cp = createProcess();
      const ready = waitForDevServerUrl(cp);
      cp.stderr!.emit(
        'data',
        Buffer.from(
          `> NOTE: Requested port ${requestedPort} is already in use\n` +
            `> Ready! Available at http://127.0.0.1:${actualPort}\n`
        )
      );
      const url = await ready;
      await waitForPortToAccept(Number(url.port), { host: url.hostname });
      const response = await fetch(url);
      expect(await response.text()).toContain('<h1>custom hello</h1>');
      expect(cp.stderr!.listenerCount('data')).toBe(0);
    } finally {
      await Promise.all(
        [app, occupied].map(
          server => new Promise<void>(resolve => server.close(() => resolve()))
        )
      );
    }
  });

  it('waits for a full URL even when the marker and port are split across chunks', async () => {
    const cp = createProcess();
    const ready = waitForDevServerUrl(cp);
    cp.stderr!.emit('data', Buffer.from('\u001b[32m> Ready! Avail\u001b[0m'));
    cp.stderr!.emit('data', Buffer.from('able at http://localhost:58'));
    cp.stderr!.emit('data', Buffer.from('353\n'));
    expect((await ready).href).toBe('http://localhost:58353/');
  });

  it('ignores other local resource URLs before readiness', async () => {
    const cp = createProcess();
    const ready = waitForDevServerUrl(cp);
    cp.stderr!.emit(
      'data',
      Buffer.from('Vercel Queues http://127.0.0.1:4782\n')
    );
    cp.stderr!.emit(
      'data',
      Buffer.from('> Ready! Available at http://localhost:43210\n')
    );
    expect((await ready).port).toBe('43210');
  });

  it('fails within the existing prompt deadline if no readiness URL arrives', async () => {
    vi.useFakeTimers();
    const cp = createProcess();
    const ready = waitForDevServerUrl(cp);
    const rejected = expect(ready).rejects.toThrow('Timed out after 5000ms');
    cp.stderr!.emit(
      'data',
      Buffer.from('> Ready! Available at http://localhost:58')
    );
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(cp.stderr!.listenerCount('data')).toBe(0);
  });

  it('fails if the process exits before readiness', async () => {
    const cp = createProcess();
    const ready = waitForDevServerUrl(cp);
    cp.emit('exit', 1);
    await expect(ready).rejects.toThrow(
      'Process exited before prompt was found'
    );
    expect(cp.stderr!.listenerCount('data')).toBe(0);
  });
});
