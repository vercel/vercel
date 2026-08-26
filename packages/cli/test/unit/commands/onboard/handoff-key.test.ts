import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  createHandoffInterrupt,
  HandoffKeyListener,
  type KeySource,
} from '../../../../src/commands/onboard/handoff-key';

class FakeStdin extends EventEmitter implements KeySource {
  isTTY? = true;
  rawMode: boolean | undefined;
  resumed = 0;
  paused = 0;

  setRawMode? = (mode: boolean) => {
    this.rawMode = mode;
    return this;
  };

  resume = () => {
    this.resumed += 1;
    return this;
  };

  pause = () => {
    this.paused += 1;
    return this;
  };

  press(byte: number): void {
    this.emit('data', Buffer.from([byte]));
  }
}

const CTRL_T = 0x14;
const CTRL_C = 0x03;
const ESC = 0x1b;

function listener(stdin: FakeStdin, options: { acceptHandoff?: boolean } = {}) {
  const onRequest = vi.fn();
  const raiseSigint = vi.fn();
  return {
    onRequest,
    raiseSigint,
    keys: new HandoffKeyListener({
      stdin,
      onRequest,
      raiseSigint,
      ...options,
    }),
  };
}

describe('HandoffKeyListener', () => {
  it('arms raw mode and queues a hand-off on ctrl+t, once', () => {
    const stdin = new FakeStdin();
    const { keys, onRequest } = listener(stdin);

    keys.arm();
    expect(stdin.rawMode).toBe(true);
    expect(stdin.resumed).toBe(1);

    stdin.press(CTRL_T);
    stdin.press(CTRL_T);
    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onRequest).toHaveBeenCalledWith('handoff');

    // Peeking does not clear; consuming does.
    expect(keys.hasPending).toBe(true);
    expect(keys.hasPending).toBe(true);
    expect(keys.consumePending()).toBe('handoff');
    expect(keys.hasPending).toBe(false);
    expect(keys.consumePending()).toBeUndefined();
  });

  it('queues a steer on a lone esc', () => {
    const stdin = new FakeStdin();
    const { keys, onRequest } = listener(stdin);

    keys.arm();
    stdin.press(ESC);

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(onRequest).toHaveBeenCalledWith('steer');
    expect(keys.pendingKind).toBe('steer');
    expect(keys.consumePending()).toBe('steer');
  });

  it('does not steer on an escape sequence, only a lone esc', () => {
    // Arrow keys and function keys arrive as multi-byte chunks that start
    // with esc; pressing one must not pause the agent.
    const stdin = new FakeStdin();
    const { keys, onRequest } = listener(stdin);

    keys.arm();
    stdin.emit('data', Buffer.from([ESC, 0x5b, 0x41])); // Up arrow

    expect(onRequest).not.toHaveBeenCalled();
    expect(keys.consumePending()).toBeUndefined();
  });

  it('keeps the first request when a second key arrives before the pause', () => {
    const stdin = new FakeStdin();
    const { keys, onRequest } = listener(stdin);

    keys.arm();
    stdin.press(ESC);
    stdin.press(CTRL_T);

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(keys.consumePending()).toBe('steer');
  });

  it('ignores ctrl+t when the hand-off is not available, but still steers', () => {
    const stdin = new FakeStdin();
    const { keys, onRequest } = listener(stdin, { acceptHandoff: false });

    keys.arm();
    stdin.press(CTRL_T);
    expect(onRequest).not.toHaveBeenCalled();
    expect(keys.consumePending()).toBeUndefined();

    stdin.press(ESC);
    expect(keys.consumePending()).toBe('steer');
  });

  it('ignores other keys entirely', () => {
    const stdin = new FakeStdin();
    const { keys, onRequest } = listener(stdin);

    keys.arm();
    stdin.press('t'.charCodeAt(0));
    stdin.press(0x0d); // Enter

    expect(onRequest).not.toHaveBeenCalled();
    expect(keys.consumePending()).toBeUndefined();
  });

  it('translates ctrl+c into SIGINT after restoring the terminal', () => {
    const stdin = new FakeStdin();
    const { keys, raiseSigint } = listener(stdin);

    keys.arm();
    stdin.press(CTRL_C);

    expect(raiseSigint).toHaveBeenCalledTimes(1);
    // Restored before raising: the abort handler exits the process.
    expect(stdin.rawMode).toBe(false);
    expect(stdin.listenerCount('data')).toBe(0);
  });

  it('disarm restores cooked mode and stops listening', () => {
    const stdin = new FakeStdin();
    const { keys, onRequest } = listener(stdin);

    keys.arm();
    keys.disarm();

    expect(stdin.rawMode).toBe(false);
    expect(stdin.paused).toBe(1);
    stdin.press(CTRL_T);
    expect(onRequest).not.toHaveBeenCalled();
  });

  it('suspendDuring lends the terminal to a prompt and re-arms after', async () => {
    const stdin = new FakeStdin();
    const { keys, onRequest } = listener(stdin);

    keys.arm();
    await keys.suspendDuring(async () => {
      // The prompt owns the terminal: a ctrl+t here must go to it, not us.
      expect(stdin.rawMode).toBe(false);
      stdin.press(CTRL_T);
    });
    expect(onRequest).not.toHaveBeenCalled();

    // Re-armed: the key works again.
    expect(stdin.rawMode).toBe(true);
    stdin.press(CTRL_T);
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('suspendDuring does not arm a listener that was not armed', async () => {
    const stdin = new FakeStdin();
    const { keys } = listener(stdin);

    await keys.suspendDuring(async () => {});
    expect(stdin.rawMode).toBeUndefined();
    expect(stdin.listenerCount('data')).toBe(0);
  });

  it('suspendDuring re-arms even when the prompt throws', async () => {
    const stdin = new FakeStdin();
    const { keys, onRequest } = listener(stdin);

    keys.arm();
    await expect(
      keys.suspendDuring(async () => {
        throw new Error('prompt failed');
      })
    ).rejects.toThrow('prompt failed');

    expect(stdin.rawMode).toBe(true);
    stdin.press(CTRL_T);
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a TTY', () => {
    const stdin = new FakeStdin();
    stdin.isTTY = undefined;
    const { keys, onRequest } = listener(stdin);

    keys.arm();
    expect(stdin.rawMode).toBeUndefined();
    stdin.press(CTRL_T);
    expect(onRequest).not.toHaveBeenCalled();
  });
});

describe('createHandoffInterrupt', () => {
  function pendingInterrupt() {
    const stdin = new FakeStdin();
    const keys = new HandoffKeyListener({
      stdin,
      onRequest: () => undefined,
      raiseSigint: () => undefined,
    });
    const onAbort = vi.fn();
    const interrupt = createHandoffInterrupt({ keys, onAbort });
    return { stdin, keys, onAbort, interrupt };
  }

  it('fires on the next part once a hand-off is pending', () => {
    const { stdin, keys, onAbort, interrupt } = pendingInterrupt();

    interrupt.onPart('text-delta');
    expect(onAbort).not.toHaveBeenCalled();

    keys.arm();
    stdin.press(CTRL_T);
    interrupt.onPart('text-delta');
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(interrupt.aborted).toBe(true);
  });

  it('never fires while a tool call is in flight', () => {
    const { stdin, keys, onAbort, interrupt } = pendingInterrupt();
    keys.arm();

    interrupt.onPart('tool-call');
    stdin.press(CTRL_T);
    interrupt.onPart('text-delta');
    expect(onAbort).not.toHaveBeenCalled();

    // The moment the command returns, the interrupt lands.
    interrupt.onPart('tool-result');
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('waits for every call of a parallel batch', () => {
    const { stdin, keys, onAbort, interrupt } = pendingInterrupt();
    keys.arm();

    interrupt.onPart('tool-call');
    interrupt.onPart('tool-call');
    stdin.press(CTRL_T);
    interrupt.onPart('tool-result');
    expect(onAbort).not.toHaveBeenCalled();
    interrupt.onPart('tool-error');
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it('fires exactly once', () => {
    const { stdin, keys, onAbort, interrupt } = pendingInterrupt();
    keys.arm();
    stdin.press(CTRL_T);

    interrupt.onPart('text-delta');
    interrupt.onPart('text-delta');
    interrupt.onPart('finish-step');
    expect(onAbort).toHaveBeenCalledTimes(1);
  });
});
