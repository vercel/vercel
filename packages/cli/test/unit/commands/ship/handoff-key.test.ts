import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  HandoffKeyListener,
  type KeySource,
} from '../../../../src/commands/ship/handoff-key';

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

function listener(stdin: FakeStdin) {
  const onRequest = vi.fn();
  const raiseSigint = vi.fn();
  return {
    onRequest,
    raiseSigint,
    keys: new HandoffKeyListener({ stdin, onRequest, raiseSigint }),
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

    expect(keys.consumePending()).toBe(true);
    expect(keys.consumePending()).toBe(false);
  });

  it('ignores other keys entirely', () => {
    const stdin = new FakeStdin();
    const { keys, onRequest } = listener(stdin);

    keys.arm();
    stdin.press('t'.charCodeAt(0));
    stdin.press(0x0d); // Enter

    expect(onRequest).not.toHaveBeenCalled();
    expect(keys.consumePending()).toBe(false);
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
