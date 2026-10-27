import { describe, expect, it } from 'vitest';
import { toDiagnostic } from '../../../../src/util/build/diagnostics';
import { toDiagnostic as toDevDiagnostic } from '../../../../src/util/dev/diagnostics';

describe('build diagnostics', () => {
  it.each([
    undefined,
    null,
    'build failed',
    42,
  ])('handles a thrown %s without throwing while reporting', value => {
    expect(toDiagnostic(value)).toMatchObject({
      name: 'BUILD_FAILED',
      message: String(value),
      cause: value,
    });
    expect(toDevDiagnostic(value).message).toBe(String(value));
  });

  it('preserves syscall codes, documentation and custom action labels', () => {
    const error = Object.assign(new Error('Could not find npm'), {
      code: 'ENOENT',
      syscall: 'spawn npm',
      errno: -2,
      link: 'https://vercel.link/builder-install',
      action: 'Troubleshoot builder installation',
    });
    expect(toDiagnostic(error)).toMatchObject({
      name: 'ENOENT',
      message: error.message,
      docs: error.link,
      action: error.action,
      cause: error,
    });
    expect(toDevDiagnostic(error).name).toBe('DEV_SYSCALL_ERROR');
  });

  it('does not trust argument-suggestion fields on an upstream object', () => {
    const error = {
      code: 'ARG_UNKNOWN_OPTION',
      message: 'Unknown option',
      allowedOptions: ['--unverified'],
      suggestedOption: '--unverified',
    };
    expect(toDiagnostic(error).fix).toBeUndefined();
  });
});
