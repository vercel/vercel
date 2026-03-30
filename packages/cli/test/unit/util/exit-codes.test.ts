import { describe, expect, it } from 'vitest';
import { EXIT_CODE } from '../../../src/util/exit-codes';
import type { ExitCode } from '../../../src/util/exit-codes';

describe('EXIT_CODE', () => {
  it('defines the expected exit code values', () => {
    expect(EXIT_CODE.SUCCESS).toBe(0);
    expect(EXIT_CODE.API_ERROR).toBe(1);
    expect(EXIT_CODE.AUTH_ERROR).toBe(2);
    expect(EXIT_CODE.VALIDATION).toBe(3);
    expect(EXIT_CODE.CONFIG_ERROR).toBe(4);
    expect(EXIT_CODE.INTERNAL).toBe(5);
  });

  it('has exactly 6 exit codes', () => {
    expect(Object.keys(EXIT_CODE)).toHaveLength(6);
  });

  it('has unique values', () => {
    const values = Object.values(EXIT_CODE);
    expect(new Set(values).size).toBe(values.length);
  });

  it('ExitCode type accepts valid exit codes', () => {
    // Type-level check: assigning each constant to ExitCode should compile
    const s: ExitCode = EXIT_CODE.SUCCESS;
    const a: ExitCode = EXIT_CODE.API_ERROR;
    const auth: ExitCode = EXIT_CODE.AUTH_ERROR;
    const v: ExitCode = EXIT_CODE.VALIDATION;
    const c: ExitCode = EXIT_CODE.CONFIG_ERROR;
    const i: ExitCode = EXIT_CODE.INTERNAL;
    expect([s, a, auth, v, c, i]).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
