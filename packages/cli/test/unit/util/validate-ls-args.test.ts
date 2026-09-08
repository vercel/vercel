import { beforeEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import { validateLsArgs } from '../../../src/util/validate-ls-args';
import output from '../../../src/output-manager';
import { getCommandName } from '../../../src/util/pkg-name';

vi.mock('../../../src/output-manager', () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock('../../../src/util/pkg-name', () => ({
  getCommandName: vi.fn((cmd: string) => `vercel ${cmd}`),
}));

const mockOutput = vi.mocked(output);
const mockGetCommandName = vi.mocked(getCommandName);

describe('validateLsArgs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when args length is within limit', () => {
    it('should return 0 for no arguments with default maxArgs (0)', () => {
      const result = validateLsArgs({
        commandName: 'test ls',
        args: [],
      });
      expect(result).toBe(0);
      expect(mockOutput.error).not.toHaveBeenCalled();
      expect(mockGetCommandName).not.toHaveBeenCalled();
    });

    it('should return 0 when args length equals maxArgs', () => {
      const result = validateLsArgs({
        commandName: 'test ls',
        args: ['arg1', 'arg2'],
        maxArgs: 2,
      });
      expect(result).toBe(0);
      expect(mockOutput.error).not.toHaveBeenCalled();
      expect(mockGetCommandName).not.toHaveBeenCalled();
    });
  });

  describe('when args length exceeds limit', () => {
    it('should return default exit code 1 when too many args', () => {
      const result = validateLsArgs({
        commandName: 'test ls',
        args: ['arg1'],
      });
      expect(result).toBe(1);
      expect(mockGetCommandName).toHaveBeenCalledWith('test ls');
      const errorCall = mockOutput.error.mock.calls[0][0];
      expect(stripAnsi(errorCall)).toBe(
        'Invalid number of arguments. Usage: vercel test ls'
      );
    });

    it('should return custom exit code when specified', () => {
      const result = validateLsArgs({
        commandName: 'test ls',
        args: ['arg1'],
        maxArgs: 0,
        exitCode: 2,
      });
      expect(result).toBe(2);
      expect(mockOutput.error).toHaveBeenCalled();
    });

    it('should use custom usage string when provided', () => {
      const customUsage = 'vercel env ls [environment] [git-branch]';
      validateLsArgs({
        commandName: 'env ls',
        args: ['arg1', 'arg2', 'arg3'],
        maxArgs: 2,
        exitCode: 1,
        usageString: customUsage,
      });
      const errorCall = mockOutput.error.mock.calls[0][0];
      expect(stripAnsi(errorCall)).toBe(
        `Invalid number of arguments. Usage: ${customUsage}`
      );
      expect(mockGetCommandName).not.toHaveBeenCalled();
    });
  });
});
