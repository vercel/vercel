import { describe, expect, it } from 'vitest';
import {
  ENTER_PROMPT_SCREEN,
  LEAVE_PROMPT_SCREEN,
  NativeTuiSession,
  nativeTuiSupported,
} from '../../../../src/commands/ship/native-handoff';
import type { DetectedHarness } from '../../../../src/commands/ship/detect-harnesses';

function harness(overrides: Partial<DetectedHarness> = {}): DetectedHarness {
  return {
    id: 'claude-code',
    label: 'Claude Code',
    status: 'ready',
    adapterPackage: '@ai-sdk/harness-claude-code',
    installHint: '',
    binPath: '/usr/local/bin/claude',
    detail: '',
    ...overrides,
  };
}

const posixOnly = process.platform === 'win32' ? it.skip : it;

describe('nativeTuiSupported', () => {
  posixOnly('offers the hand-off for a ready claude-code with a shim', () => {
    expect(
      nativeTuiSupported(harness(), { shimInstalled: true, isTTY: true })
    ).toBe(true);
  });

  posixOnly('refuses without the shim — gates and ledger would vanish', () => {
    expect(
      nativeTuiSupported(harness(), { shimInstalled: false, isTTY: true })
    ).toBe(false);
  });

  posixOnly('refuses without a terminal to hand over', () => {
    expect(
      nativeTuiSupported(harness(), { shimInstalled: true, isTTY: false })
    ).toBe(false);
  });

  posixOnly('refuses without a resolved executable', () => {
    expect(
      nativeTuiSupported(harness({ binPath: undefined }), {
        shimInstalled: true,
        isTTY: true,
      })
    ).toBe(false);
  });

  posixOnly('refuses a harness without a validated native interface', () => {
    expect(
      nativeTuiSupported(harness({ id: 'codex', label: 'Codex' }), {
        shimInstalled: true,
        isTTY: true,
      })
    ).toBe(false);
  });

  it('refuses on Windows, where the shim and job control do not exist', () => {
    if (process.platform !== 'win32') return;
    expect(
      nativeTuiSupported(harness(), { shimInstalled: true, isTTY: true })
    ).toBe(false);
  });
});

describe('NativeTuiSession', () => {
  it('is inactive before any hand-off', () => {
    expect(new NativeTuiSession().active).toBe(false);
  });

  it('withTerminal is a plain passthrough while inactive', async () => {
    const session = new NativeTuiSession();
    let ran = false;
    const result = await session.withTerminal(async () => {
      ran = true;
      return 42;
    });
    expect(ran).toBe(true);
    expect(result).toBe(42);
  });

  it('withTerminal propagates a thrown prompt while inactive', async () => {
    const session = new NativeTuiSession();
    await expect(
      session.withTerminal(async () => {
        throw new Error('prompt failed');
      })
    ).rejects.toThrow('prompt failed');
  });

  posixOnly('run resolves with the exit code and deactivates', async () => {
    const session = new NativeTuiSession();
    // `true --continue` exits 0 immediately; any argv is ignored.
    const code = await session.run(
      harness({ binPath: '/usr/bin/true' }),
      undefined
    );
    expect(code).toBe(0);
    expect(session.active).toBe(false);
  });

  it('restores every emulator mode the prompt screen changes', () => {
    // Modes disabled for the prompt must be re-enabled for the TUI, and the
    // alternate screen must be entered and left. Asymmetry here is exactly
    // the class of bug that scribbled escape noise over the frozen frame.
    const pairs: Array<[string, string]> = [
      ['\x1b[?1049h', '\x1b[?1049l'], // alternate screen
      ['\x1b[<u', '\x1b[>1u'], // kitty keyboard pop/push
      ['\x1b[>4;0m', '\x1b[>4;2m'], // modifyOtherKeys
      ['\x1b[?2004l', '\x1b[?2004h'], // bracketed paste
      ['\x1b[?1004l', '\x1b[?1004h'], // focus reporting
      ['\x1b[?2031l', '\x1b[?2031h'], // theme notifications
      ['\x1b[?25h', '\x1b[?25l'], // cursor
    ];
    for (const [enter, leave] of pairs) {
      expect(ENTER_PROMPT_SCREEN).toContain(enter);
      expect(LEAVE_PROMPT_SCREEN).toContain(leave);
    }
  });

  posixOnly('run reports a missing executable as a failure', async () => {
    const session = new NativeTuiSession();
    const code = await session.run(
      harness({ binPath: '/nonexistent/claude-definitely-missing' }),
      undefined
    );
    expect(code).toBe(1);
    expect(session.active).toBe(false);
  });
});
