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

    it('should return 0 when args length is less than maxArgs', () => {
      const result = validateLsArgs({
        commandName: 'test ls',
        args: ['arg1'],
        maxArgs: 2,
      });
      expect(result).toBe(0);
      expect(mockOutput.error).not.toHaveBeenCalled();
      expect(mockGetCommandName).not.toHaveBeenCalled();
    });

    it('should return 0 for empty args with maxArgs > 0', () => {
      const result = validateLsArgs({
        commandName: 'dns ls',
        args: [],
        maxArgs: 1,
      });
      expect(result).toBe(0);
      expect(mockOutput.error).not.toHaveBeenCalled();
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

    it('should use default command name when no custom usage string provided', () => {
      validateLsArgs({
        commandName: 'alias ls',
        args: ['extra-arg'],
      });
      expect(mockGetCommandName).toHaveBeenCalledWith('alias ls');
      const errorCall = mockOutput.error.mock.calls[0][0];
      expect(stripAnsi(errorCall)).toBe(
        'Invalid number of arguments. Usage: vercel alias ls'
      );
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

    it('should handle multiple extra arguments', () => {
      const result = validateLsArgs({
        commandName: 'teams ls',
        args: ['arg1', 'arg2', 'arg3'],
        maxArgs: 0,
        exitCode: 2,
      });
      expect(result).toBe(2);
      const errorCall = mockOutput.error.mock.calls[0][0];
      expect(stripAnsi(errorCall)).toBe(
        'Invalid number of arguments. Usage: vercel teams ls'
      );
    });
  });

  describe('different maxArgs values', () => {
    it('should handle maxArgs of 0', () => {
      const result = validateLsArgs({
        commandName: 'domains ls',
        args: ['extra'],
        maxArgs: 0,
        exitCode: 2,
      });
      expect(result).toBe(2);
      expect(mockOutput.error).toHaveBeenCalled();
    });

    it('should handle maxArgs of 1', () => {
      const result = validateLsArgs({
        commandName: 'dns ls',
        args: ['domain', 'extra'],
        maxArgs: 1,
      });
      expect(result).toBe(1);
      expect(mockOutput.error).toHaveBeenCalled();
    });

    it('should handle maxArgs of 2', () => {
      const result = validateLsArgs({
        commandName: 'env ls',
        args: ['env', 'branch', 'extra'],
        maxArgs: 2,
      });
      expect(result).toBe(1);
      expect(mockOutput.error).toHaveBeenCalled();
    });

    it('should allow exactly maxArgs arguments', () => {
      const result = validateLsArgs({
        commandName: 'integration list',
        args: ['cmd', 'project'],
        maxArgs: 2,
      });
      expect(result).toBe(0);
      expect(mockOutput.error).not.toHaveBeenCalled();
    });
  });

  describe('different exit codes', () => {
    it('should use exit code 1 by default', () => {
      const result = validateLsArgs({
        commandName: 'alias ls',
        args: ['extra'],
      });
      expect(result).toBe(1);
    });

    it('should use exit code 2 when specified', () => {
      const result = validateLsArgs({
        commandName: 'domains ls',
        args: ['extra'],
        maxArgs: 0,
        exitCode: 2,
      });
      expect(result).toBe(2);
    });

    it('should use custom exit code for commands requiring it', () => {
      const result = validateLsArgs({
        commandName: 'teams ls',
        args: ['extra'],
        maxArgs: 0,
        exitCode: 2,
      });
      expect(result).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty command name', () => {
      const result = validateLsArgs({
        commandName: '',
        args: ['extra'],
      });
      expect(result).toBe(1);
      expect(mockGetCommandName).toHaveBeenCalledWith('');
    });

    it('should handle command with spaces', () => {
      const result = validateLsArgs({
        commandName: 'project list',
        args: ['extra'],
        maxArgs: 0,
      });
      expect(result).toBe(1);
      expect(mockGetCommandName).toHaveBeenCalledWith('project list');
    });

    it('should handle empty args array with maxArgs 0', () => {
      const result = validateLsArgs({
        commandName: 'test',
        args: [],
      });
      expect(result).toBe(0);
      expect(mockOutput.error).not.toHaveBeenCalled();
    });

    it('should handle null/undefined gracefully', () => {
      const result = validateLsArgs({
        commandName: 'test',
        args: ['arg'],
        maxArgs: 0,
        exitCode: 1,
        usageString: undefined,
      });
      expect(result).toBe(1);
      expect(mockGetCommandName).toHaveBeenCalledWith('test');
    });
  });

  describe('real-world command scenarios', () => {
    it('should validate alias ls (no args allowed)', () => {
      expect(validateLsArgs({ commandName: 'alias ls', args: [] })).toBe(0);
      expect(validateLsArgs({ commandName: 'alias ls', args: ['extra'] })).toBe(
        1
      );
    });

    it('should validate dns ls with optional domain', () => {
      expect(
        validateLsArgs({ commandName: 'dns ls', args: [], maxArgs: 1 })
      ).toBe(0);
      expect(
        validateLsArgs({
          commandName: 'dns ls',
          args: ['domain.com'],
          maxArgs: 1,
        })
      ).toBe(0);
      expect(
        validateLsArgs({
          commandName: 'dns ls',
          args: ['domain.com', 'extra'],
          maxArgs: 1,
        })
      ).toBe(1);
    });

    it('should validate env ls with optional environment and branch', () => {
      expect(
        validateLsArgs({ commandName: 'env ls', args: [], maxArgs: 2 })
      ).toBe(0);
      expect(
        validateLsArgs({
          commandName: 'env ls',
          args: ['production'],
          maxArgs: 2,
        })
      ).toBe(0);
      expect(
        validateLsArgs({
          commandName: 'env ls',
          args: ['production', 'main'],
          maxArgs: 2,
        })
      ).toBe(0);
      expect(
        validateLsArgs({
          commandName: 'env ls',
          args: ['production', 'main', 'extra'],
          maxArgs: 2,
        })
      ).toBe(1);
    });

    it('should validate commands with exit code 2', () => {
      expect(
        validateLsArgs({
          commandName: 'domains ls',
          args: ['extra'],
          maxArgs: 0,
          exitCode: 2,
        })
      ).toBe(2);
      expect(
        validateLsArgs({
          commandName: 'teams ls',
          args: ['extra'],
          maxArgs: 0,
          exitCode: 2,
        })
      ).toBe(2);
      expect(
        validateLsArgs({
          commandName: 'target list',
          args: ['extra'],
          maxArgs: 0,
          exitCode: 2,
        })
      ).toBe(2);
    });

    it('should handle integration list with project argument', () => {
      expect(
        validateLsArgs({
          commandName: 'integration list',
          args: ['list'],
          maxArgs: 2,
        })
      ).toBe(0);
      expect(
        validateLsArgs({
          commandName: 'integration list',
          args: ['list', 'project'],
          maxArgs: 2,
        })
      ).toBe(0);
      expect(
        validateLsArgs({
          commandName: 'integration list',
          args: ['list', 'project', 'extra'],
          maxArgs: 2,
        })
      ).toBe(1);
    });
  });

  describe('error message formatting', () => {
    it('should format error message correctly', () => {
      validateLsArgs({
        commandName: 'test ls',
        args: ['extra'],
      });
      const errorCall = mockOutput.error.mock.calls[0][0];

      expect(stripAnsi(errorCall)).toBe(
        'Invalid number of arguments. Usage: vercel test ls'
      );

      expect(errorCall).toContain('Invalid number of arguments. Usage:');
      expect(errorCall).toContain('vercel test ls');
    });

    it('should include command name in error message', () => {
      validateLsArgs({
        commandName: 'certs ls',
        args: ['extra'],
      });
      expect(mockGetCommandName).toHaveBeenCalledWith('certs ls');
      const errorCall = mockOutput.error.mock.calls[0][0];
      expect(stripAnsi(errorCall)).toContain('vercel certs ls');
    });

    it('should use custom usage string in error message', () => {
      const customUsage = 'vercel env ls [environment] [gitbranch]';
      validateLsArgs({
        commandName: 'env ls',
        args: ['a', 'b', 'c'],
        maxArgs: 2,
        exitCode: 1,
        usageString: customUsage,
      });
      const errorCall = mockOutput.error.mock.calls[0][0];
      expect(stripAnsi(errorCall)).toBe(
        `Invalid number of arguments. Usage: ${customUsage}`
      );
    });
  });
});
