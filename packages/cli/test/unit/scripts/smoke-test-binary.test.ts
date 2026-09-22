import { describe, expect, it } from 'vitest';
import { evaluateCommand } from '../../../scripts/smoke-test-binary.mjs';

const helpCommand = {
  args: ['deploy', '--help'],
};

describe('evaluateCommand()', () => {
  it('accepts a successful command with output', () => {
    expect(
      evaluateCommand(helpCommand, {
        output: 'Deploy a project',
        code: 0,
        signal: null,
      })
    ).toEqual({
      label: 'vc deploy --help',
      ok: true,
      reasons: [],
    });
  });

  it('rejects an unexpected exit code', () => {
    const verdict = evaluateCommand(helpCommand, {
      output: 'Deploy a project',
      code: 2,
      signal: null,
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toContain('exited with code 2 (expected 0)');
  });

  it('supports an expected unauthenticated exit', () => {
    const verdict = evaluateCommand(
      {
        args: ['whoami'],
        acceptedExitCodes: [1],
        outputPattern: /Logged out\./,
      },
      {
        output: 'Logged out.',
        code: 1,
        signal: null,
      }
    );

    expect(verdict.ok).toBe(true);
  });

  it('rejects missing expected output', () => {
    const verdict = evaluateCommand(helpCommand, {
      output: '',
      code: 0,
      signal: null,
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toContain('output did not match /\\S/');
  });

  it('rejects known runtime failures even with a zero exit code', () => {
    const verdict = evaluateCommand(helpCommand, {
      output: "Error: Cannot find module '@vercel/example'",
      code: 0,
      signal: null,
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toContain('matched /Cannot find module/');
  });

  it('rejects commands terminated by a signal', () => {
    const verdict = evaluateCommand(helpCommand, {
      output: 'Timed out',
      code: null,
      signal: 'SIGKILL',
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toContain('killed by signal SIGKILL');
  });

  it('rejects a binary that cannot be spawned', () => {
    const verdict = evaluateCommand(helpCommand, {
      output: 'spawn error: ENOENT',
      code: null,
      signal: 'SPAWN_ERROR',
    });

    expect(verdict.ok).toBe(false);
    expect(verdict.reasons).toContain('failed to spawn binary');
  });
});
