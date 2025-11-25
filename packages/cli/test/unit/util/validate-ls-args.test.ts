import { beforeEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import { validateLsArgs } from '../../../src/util/validate-ls-args';
import output from '../../../src/output-manager';
import { getCommandName } from '../../../src/util/pkg-name';

// Mock the output module
vi.mock('../../../src/output-manager', () => ({
  default: {
    error: vi.fn(),
  },
}));

// Mock the pkg-name module
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
      const result = validateLsArgs('test ls', []);
      expect(result).toBe(0);
      expect(mockOutput.error).not.toHaveBeenCalled();
      expect(mockGetCommandName).not.toHaveBeenCalled();
    });

    it('should return 0 when args length equals maxArgs', () => {
      const result = validateLsArgs('test ls', ['arg1', 'arg2'], 2);
      expect(result).toBe(0);
      expect(mockOutput.error).not.toHaveBeenCalled();
      expect(mockGetCommandName).not.toHaveBeenCalled();
    });

    it('should return 0 when args length is less than maxArgs', () => {
      const result = validateLsArgs('test ls', ['arg1'], 2);
      expect(result).toBe(0);
      expect(mockOutput.error).not.toHaveBeenCalled();
      expect(mockGetCommandName).not.toHaveBeenCalled();
    });

    it('should return 0 for empty args with maxArgs > 0', () => {
      const result = validateLsArgs('dns ls', [], 1);
      expect(result).toBe(0);
      expect(mockOutput.error).not.toHaveBeenCalled();
    });
  });

  describe('when args length exceeds limit', () => {
    it('should return default exit code 1 when too many args', () => {
      const result = validateLsArgs('test ls', ['arg1']);
      expect(result).toBe(1);
      expect(mockGetCommandName).toHaveBeenCalledWith('test ls');
      const errorCall = mockOutput.error.mock.calls[0][0];
      expect(stripAnsi(errorCall)).toBe(
        'Invalid number of arguments. Usage: vercel test ls'
      );
    });

    it('should return custom exit code when specified', () => {
      const result = validateLsArgs('test ls', ['arg1'], 0, 2);
      expect(result).toBe(2);
      expect(mockOutput.error).toHaveBeenCalled();
    });

    it('should use default command name when no custom usage string provided', () => {
      validateLsArgs('alias ls', ['extra-arg']);
      expect(mockGetCommandName).toHaveBeenCalledWith('alias ls');
      const errorCall = mockOutput.error.mock.calls[0][0];
      expect(stripAnsi(errorCall)).toBe(
        'Invalid number of arguments. Usage: vercel alias ls'
      );
    });

    it('should use custom usage string when provided', () => {
      const customUsage = 'vercel env ls [environment] [git-branch]';
      validateLsArgs('env ls', ['arg1', 'arg2', 'arg3'], 2, 1, customUsage);
      const errorCall = mockOutput.error.mock.calls[0][0];
      expect(stripAnsi(errorCall)).toBe(
        `Invalid number of arguments. Usage: ${customUsage}`
      );
      expect(mockGetCommandName).not.toHaveBeenCalled();
    });

    it('should handle multiple extra arguments', () => {
      const result = validateLsArgs('teams ls', ['arg1', 'arg2', 'arg3'], 0, 2);
      expect(result).toBe(2);
      const errorCall = mockOutput.error.mock.calls[0][0];
      expect(stripAnsi(errorCall)).toBe(
        'Invalid number of arguments. Usage: vercel teams ls'
      );
    });
  });

  describe('different maxArgs values', () => {
    it('should handle maxArgs of 0', () => {
      const result = validateLsArgs('domains ls', ['extra'], 0, 2);
      expect(result).toBe(2);
      expect(mockOutput.error).toHaveBeenCalled();
    });

    it('should handle maxArgs of 1', () => {
      const result = validateLsArgs('dns ls', ['domain', 'extra'], 1);
      expect(result).toBe(1);
      expect(mockOutput.error).toHaveBeenCalled();
    });

    it('should handle maxArgs of 2', () => {
      const result = validateLsArgs('env ls', ['env', 'branch', 'extra'], 2);
      expect(result).toBe(1);
      expect(mockOutput.error).toHaveBeenCalled();
    });

    it('should allow exactly maxArgs arguments', () => {
      const result = validateLsArgs('integration list', ['cmd', 'project'], 2);
      expect(result).toBe(0);
      expect(mockOutput.error).not.toHaveBeenCalled();
    });
  });

  describe('different exit codes', () => {
    it('should use exit code 1 by default', () => {
      const result = validateLsArgs('alias ls', ['extra']);
      expect(result).toBe(1);
    });

    it('should use exit code 2 when specified', () => {
      const result = validateLsArgs('domains ls', ['extra'], 0, 2);
      expect(result).toBe(2);
    });

    it('should use custom exit code for commands requiring it', () => {
      const result = validateLsArgs('teams ls', ['extra'], 0, 2);
      expect(result).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty command name', () => {
      const result = validateLsArgs('', ['extra']);
      expect(result).toBe(1);
      expect(mockGetCommandName).toHaveBeenCalledWith('');
    });

    it('should handle command with spaces', () => {
      const result = validateLsArgs('project list', ['extra'], 0);
      expect(result).toBe(1);
      expect(mockGetCommandName).toHaveBeenCalledWith('project list');
    });

    it('should handle empty args array with maxArgs 0', () => {
      const result = validateLsArgs('test', []);
      expect(result).toBe(0);
      expect(mockOutput.error).not.toHaveBeenCalled();
    });

    it('should handle null/undefined gracefully', () => {
      const result = validateLsArgs('test', ['arg'], 0, 1, undefined);
      expect(result).toBe(1);
      expect(mockGetCommandName).toHaveBeenCalledWith('test');
    });
  });

  describe('real-world command scenarios', () => {
    it('should validate alias ls (no args allowed)', () => {
      expect(validateLsArgs('alias ls', [])).toBe(0);
      expect(validateLsArgs('alias ls', ['extra'])).toBe(1);
    });

    it('should validate dns ls with optional domain', () => {
      expect(validateLsArgs('dns ls', [], 1)).toBe(0);
      expect(validateLsArgs('dns ls', ['domain.com'], 1)).toBe(0);
      expect(validateLsArgs('dns ls', ['domain.com', 'extra'], 1)).toBe(1);
    });

    it('should validate env ls with optional environment and branch', () => {
      expect(validateLsArgs('env ls', [], 2)).toBe(0);
      expect(validateLsArgs('env ls', ['production'], 2)).toBe(0);
      expect(validateLsArgs('env ls', ['production', 'main'], 2)).toBe(0);
      expect(validateLsArgs('env ls', ['production', 'main', 'extra'], 2)).toBe(
        1
      );
    });

    it('should validate commands with exit code 2', () => {
      expect(validateLsArgs('domains ls', ['extra'], 0, 2)).toBe(2);
      expect(validateLsArgs('teams ls', ['extra'], 0, 2)).toBe(2);
      expect(validateLsArgs('target list', ['extra'], 0, 2)).toBe(2);
    });

    it('should handle integration list with project argument', () => {
      // Integration list uses client.argv.slice(3) so it includes command name
      expect(validateLsArgs('integration list', ['list'], 2)).toBe(0);
      expect(validateLsArgs('integration list', ['list', 'project'], 2)).toBe(
        0
      );
      expect(
        validateLsArgs('integration list', ['list', 'project', 'extra'], 2)
      ).toBe(1);
    });
  });

  describe('error message formatting', () => {
    it('should format error message correctly', () => {
      validateLsArgs('test ls', ['extra']);
      const errorCall = mockOutput.error.mock.calls[0][0];

      // Should have correct text (chalk may or may not colorize in test mode)
      expect(stripAnsi(errorCall)).toBe(
        'Invalid number of arguments. Usage: vercel test ls'
      );

      // Should contain the basic structure
      expect(errorCall).toContain('Invalid number of arguments. Usage:');
      expect(errorCall).toContain('vercel test ls');
    });

    it('should include command name in error message', () => {
      validateLsArgs('certs ls', ['extra']);
      expect(mockGetCommandName).toHaveBeenCalledWith('certs ls');
      const errorCall = mockOutput.error.mock.calls[0][0];
      expect(stripAnsi(errorCall)).toContain('vercel certs ls');
    });

    it('should use custom usage string in error message', () => {
      const customUsage = 'vercel env ls [environment] [gitbranch]';
      validateLsArgs('env ls', ['a', 'b', 'c'], 2, 1, customUsage);
      const errorCall = mockOutput.error.mock.calls[0][0];
      expect(stripAnsi(errorCall)).toBe(
        `Invalid number of arguments. Usage: ${customUsage}`
      );
    });
  });
});
