import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const { FakeWebSocket, wsInstances } = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = FakeWebSocket.CONNECTING;
    sent: Array<string | Buffer> = [];
    url: string;
    private listenersByEvent: Record<string, Listener[]> = {};

    constructor(url: string) {
      this.url = url;
      wsInstances.push(this);
    }

    on(event: string, listener: Listener) {
      (this.listenersByEvent[event] ??= []).push(listener);
      return this;
    }

    once(event: string, listener: Listener) {
      const wrapped: Listener = (...args) => {
        this.removeListener(event, wrapped);
        listener(...args);
      };
      return this.on(event, wrapped);
    }

    removeListener(event: string, listener: Listener) {
      this.listenersByEvent[event] = (
        this.listenersByEvent[event] ?? []
      ).filter(l => l !== listener);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const listener of this.listenersByEvent[event] ?? []) {
        listener(...args);
      }
    }

    send(data: string | Buffer) {
      this.sent.push(data);
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED;
    }
  }
  const wsInstances: InstanceType<typeof FakeWebSocket>[] = [];
  return { FakeWebSocket, wsInstances };
});

vi.mock('ws', () => ({ WebSocket: FakeWebSocket }));

const { extendSandboxTimeoutPeriodically } = vi.hoisted(() => ({
  extendSandboxTimeoutPeriodically: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../src/util/sandbox/extend-timeout', () => ({
  extendSandboxTimeoutPeriodically,
}));

import { startInteractiveShell } from '../../../../src/util/sandbox/interactive-shell';

function openSocket(ws: InstanceType<typeof FakeWebSocket>) {
  ws.readyState = FakeWebSocket.OPEN;
  ws.emit('open');
}

class FakeStdin extends EventEmitter {
  isTTY = true;
  setRawMode = vi.fn();
  resume = vi.fn();
  pause = vi.fn();
  unref = vi.fn();
}

function createFakeStdout() {
  return {
    columns: 80,
    rows: 24,
    write: vi.fn(() => true),
  };
}

function fakeSandbox() {
  return {
    cwd: '/vercel/sandbox',
    name: 'my-sandbox',
    openInteractive: vi
      .fn()
      .mockResolvedValue({ url: 'ws://fake-host/pty', token: 'tok123' }),
  };
}

describe('startInteractiveShell', () => {
  let originalStdin: NodeJS.ReadStream & { fd: 0 };
  let originalStdout: NodeJS.WriteStream & { fd: 1 };
  let fakeStdin: FakeStdin;
  let fakeStdout: ReturnType<typeof createFakeStdout>;

  beforeEach(() => {
    originalStdin = process.stdin;
    originalStdout = process.stdout;
    fakeStdin = new FakeStdin();
    fakeStdout = createFakeStdout();
    Object.defineProperty(process, 'stdin', {
      value: fakeStdin,
      configurable: true,
    });
    Object.defineProperty(process, 'stdout', {
      value: fakeStdout,
      configurable: true,
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    extendSandboxTimeoutPeriodically.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      configurable: true,
    });
    Object.defineProperty(process, 'stdout', {
      value: originalStdout,
      configurable: true,
    });
    process.removeAllListeners('beforeExit');
    process.removeAllListeners('SIGWINCH');
    process.exitCode = undefined;
    wsInstances.length = 0;
    extendSandboxTimeoutPeriodically.mockClear();
    vi.restoreAllMocks();
  });

  it('sends a start frame with command, args, TERM and cols/rows', async () => {
    const sandbox = fakeSandbox();
    const donePromise = startInteractiveShell({
      sandbox: sandbox as never,
      execution: ['bash'],
      envVars: { FOO: 'bar' },
      sudo: false,
      skipExtendingTimeout: true,
    });

    await vi.waitFor(() => expect(wsInstances).toHaveLength(1));
    const ws = wsInstances[0];
    openSocket(ws);
    await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThan(0));

    const startFrame = JSON.parse(ws.sent[0] as string);
    expect(startFrame.type).toBe('start');
    expect(startFrame.command).toBe('bash');
    expect(startFrame.args).toEqual([]);
    expect(startFrame.cwd).toBe('/vercel/sandbox');
    expect(startFrame.env).toEqual(
      expect.arrayContaining(['TERM=xterm-256color', 'FOO=bar'])
    );
    expect(
      startFrame.env.some((entry: string) => entry.startsWith('PS1='))
    ).toBe(true);
    expect(typeof startFrame.cols).toBe('number');
    expect(typeof startFrame.rows).toBe('number');

    ws.emit('close');
    await donePromise;
  });

  it('forwards a stdin data chunk as a binary ws.send', async () => {
    const sandbox = fakeSandbox();
    const donePromise = startInteractiveShell({
      sandbox: sandbox as never,
      execution: ['bash'],
      envVars: {},
      sudo: false,
      skipExtendingTimeout: true,
    });

    await vi.waitFor(() => expect(wsInstances).toHaveLength(1));
    const ws = wsInstances[0];
    openSocket(ws);
    await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThan(0));

    const chunk = Buffer.from('ls -la\n');
    fakeStdin.emit('data', chunk);

    expect(ws.sent).toContainEqual(chunk);

    ws.emit('close');
    await donePromise;
  });

  it('writes binary server frames to stdout', async () => {
    const sandbox = fakeSandbox();
    const donePromise = startInteractiveShell({
      sandbox: sandbox as never,
      execution: ['bash'],
      envVars: {},
      sudo: false,
      skipExtendingTimeout: true,
    });

    await vi.waitFor(() => expect(wsInstances).toHaveLength(1));
    const ws = wsInstances[0];
    openSocket(ws);
    await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThan(0));

    const outputChunk = Buffer.from('hello from sandbox\n');
    ws.emit('message', outputChunk, true);

    expect(fakeStdout.write).toHaveBeenCalledWith(outputChunk);

    ws.emit('close');
    await donePromise;
  });

  it('sets process.exitCode from an exit control frame', async () => {
    const sandbox = fakeSandbox();
    const donePromise = startInteractiveShell({
      sandbox: sandbox as never,
      execution: ['bash'],
      envVars: {},
      sudo: false,
      skipExtendingTimeout: true,
    });

    await vi.waitFor(() => expect(wsInstances).toHaveLength(1));
    const ws = wsInstances[0];
    openSocket(ws);
    await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThan(0));

    ws.emit(
      'message',
      Buffer.from(JSON.stringify({ type: 'exit', code: 7 })),
      false
    );

    ws.emit('close');
    await donePromise;

    expect(process.exitCode).toBe(7);
  });

  it('sets raw mode on start and restores it on close', async () => {
    const sandbox = fakeSandbox();
    const donePromise = startInteractiveShell({
      sandbox: sandbox as never,
      execution: ['bash'],
      envVars: {},
      sudo: false,
      skipExtendingTimeout: true,
    });

    await vi.waitFor(() => expect(wsInstances).toHaveLength(1));
    const ws = wsInstances[0];
    openSocket(ws);
    await vi.waitFor(() =>
      expect(fakeStdin.setRawMode).toHaveBeenCalledWith(true)
    );

    ws.emit('close');
    await donePromise;

    expect(fakeStdin.setRawMode).toHaveBeenLastCalledWith(false);
  });

  it('skips the timeout-extension loop when skipExtendingTimeout is true', async () => {
    const sandbox = fakeSandbox();
    const donePromise = startInteractiveShell({
      sandbox: sandbox as never,
      execution: ['bash'],
      envVars: {},
      sudo: false,
      skipExtendingTimeout: true,
    });

    await vi.waitFor(() => expect(wsInstances).toHaveLength(1));
    const ws = wsInstances[0];
    openSocket(ws);
    await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThan(0));

    expect(extendSandboxTimeoutPeriodically).not.toHaveBeenCalled();

    ws.emit('close');
    await donePromise;
  });

  it('starts the timeout-extension loop unless skipped', async () => {
    const sandbox = fakeSandbox();
    const donePromise = startInteractiveShell({
      sandbox: sandbox as never,
      execution: ['bash'],
      envVars: {},
      sudo: false,
      skipExtendingTimeout: false,
    });

    await vi.waitFor(() => expect(wsInstances).toHaveLength(1));
    const ws = wsInstances[0];
    openSocket(ws);
    await vi.waitFor(() =>
      expect(extendSandboxTimeoutPeriodically).toHaveBeenCalledWith(
        sandbox,
        expect.anything()
      )
    );

    ws.emit('close');
    await donePromise;
  });

  it('prepends sudo to the executed command but not the printed command', async () => {
    const sandbox = fakeSandbox();
    const donePromise = startInteractiveShell({
      sandbox: sandbox as never,
      execution: ['whoami'],
      envVars: {},
      sudo: true,
      skipExtendingTimeout: true,
    });

    await vi.waitFor(() => expect(wsInstances).toHaveLength(1));
    const ws = wsInstances[0];
    openSocket(ws);
    await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThan(0));

    const startFrame = JSON.parse(ws.sent[0] as string);
    expect(startFrame.command).toBe('sudo');
    expect(startFrame.args).toEqual(['whoami']);

    ws.emit('close');
    await donePromise;
  });
});
