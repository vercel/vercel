import { describe, expect, it } from 'vitest';
import {
  validateSafePath,
  rejectControlChars,
  validateResourceId,
  rejectDoubleEncoding,
  validateKeyValue,
  validateTarget,
  validateInput,
} from '../../../src/util/input-validation';

describe('validateSafePath', () => {
  it('accepts a simple relative path', () => {
    expect(validateSafePath('src/index.ts')).toEqual({ valid: true });
  });

  it('accepts a plain filename', () => {
    expect(validateSafePath('file.txt')).toEqual({ valid: true });
  });

  it('rejects .. traversal', () => {
    const result = validateSafePath('../../etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Path traversal');
  });

  it('rejects mid-path traversal', () => {
    const result = validateSafePath('src/../../../etc/shadow');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Path traversal');
  });

  it('rejects absolute paths', () => {
    const result = validateSafePath('/etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Path traversal');
  });

  it('rejects home-relative paths', () => {
    const result = validateSafePath('~/.ssh/id_rsa');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Path traversal');
  });

  it('rejects percent-encoded traversal (%2e%2e)', () => {
    const result = validateSafePath('%2e%2e/%2e%2e/etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Path traversal');
  });
});

describe('rejectControlChars', () => {
  it('accepts normal text', () => {
    expect(rejectControlChars('hello world', 'name')).toEqual({ valid: true });
  });

  it('accepts newline, carriage return, tab', () => {
    expect(rejectControlChars('line1\nline2', 'desc')).toEqual({ valid: true });
    expect(rejectControlChars('col1\tcol2', 'desc')).toEqual({ valid: true });
    expect(rejectControlChars('line\r\n', 'desc')).toEqual({ valid: true });
  });

  it('rejects null byte', () => {
    const result = rejectControlChars('hello\x00world', 'name');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Control characters');
    expect(result.error).toContain('name');
  });

  it('rejects ANSI escape sequences', () => {
    const result = rejectControlChars('\x1b[31mred\x1b[0m', 'color');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Control characters');
  });

  it('rejects bell character', () => {
    const result = rejectControlChars('alert\x07', 'field');
    expect(result.valid).toBe(false);
  });

  it('rejects DEL character (0x7f)', () => {
    const result = rejectControlChars('data\x7f', 'field');
    expect(result.valid).toBe(false);
  });
});

describe('validateResourceId', () => {
  it('accepts a plain resource ID', () => {
    expect(validateResourceId('proj_abc123', 'project')).toEqual({
      valid: true,
    });
  });

  it('accepts IDs with hyphens and underscores', () => {
    expect(validateResourceId('my-project_v2', 'project')).toEqual({
      valid: true,
    });
  });

  it('rejects IDs with query params', () => {
    const result = validateResourceId('proj_123?fields=name', 'project');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('?');
    expect(result.error).toContain('project');
  });

  it('rejects IDs with fragment', () => {
    const result = validateResourceId('proj_123#section', 'project');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('#');
  });
});

describe('rejectDoubleEncoding', () => {
  it('accepts plain text', () => {
    expect(rejectDoubleEncoding('hello', 'field')).toEqual({ valid: true });
  });

  it('accepts normal percent-encoded safe chars', () => {
    expect(rejectDoubleEncoding('hello%20world', 'field')).toEqual({
      valid: true,
    });
  });

  it('rejects %2e (encoded dot)', () => {
    const result = rejectDoubleEncoding('%2e%2e/etc', 'path');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Percent-encoded traversal');
  });

  it('rejects %2E (uppercase encoded dot)', () => {
    const result = rejectDoubleEncoding('%2E%2E/', 'path');
    expect(result.valid).toBe(false);
  });

  it('rejects %2f (encoded slash)', () => {
    const result = rejectDoubleEncoding('..%2f..%2f', 'path');
    expect(result.valid).toBe(false);
  });

  it('rejects %5c (encoded backslash)', () => {
    const result = rejectDoubleEncoding('..%5c..', 'path');
    expect(result.valid).toBe(false);
  });
});

describe('validateKeyValue', () => {
  it('accepts valid KEY=VALUE', () => {
    expect(validateKeyValue('API_KEY=abc123', '--env')).toEqual({
      valid: true,
    });
  });

  it('accepts value with equals sign', () => {
    expect(validateKeyValue('URL=postgres://host?opt=1', '--env')).toEqual({
      valid: true,
    });
  });

  it('accepts empty value', () => {
    expect(validateKeyValue('KEY=', '--env')).toEqual({ valid: true });
  });

  it('rejects missing equals sign', () => {
    const result = validateKeyValue('JUST_A_KEY', '--env');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('KEY=VALUE');
    expect(result.error).toContain('--env');
  });

  it('rejects empty key', () => {
    const result = validateKeyValue('=value', '--build-env');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Key must not be empty');
  });
});

describe('validateTarget', () => {
  it('accepts production', () => {
    expect(validateTarget('production')).toEqual({ valid: true });
  });

  it('accepts preview', () => {
    expect(validateTarget('preview')).toEqual({ valid: true });
  });

  it('accepts custom alphanumeric target', () => {
    expect(validateTarget('staging-v2')).toEqual({ valid: true });
  });

  it('accepts underscores', () => {
    expect(validateTarget('my_custom_env')).toEqual({ valid: true });
  });

  it('rejects empty string', () => {
    const result = validateTarget('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must not be empty');
  });

  it('rejects path traversal in target', () => {
    const result = validateTarget('../evil');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid target');
  });

  it('rejects spaces', () => {
    const result = validateTarget('my target');
    expect(result.valid).toBe(false);
  });

  it('rejects special characters', () => {
    const result = validateTarget('target;rm -rf');
    expect(result.valid).toBe(false);
  });
});

describe('validateInput', () => {
  it('passes when all checks pass', () => {
    const result = validateInput('my-project', 'project', [
      'controlChars',
      'resourceId',
    ]);
    expect(result.valid).toBe(true);
  });

  it('returns first failure from control chars check', () => {
    const result = validateInput('proj\x00ect', 'project', [
      'controlChars',
      'resourceId',
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Control characters');
  });

  it('returns first failure from resource ID check', () => {
    const result = validateInput('proj?id=1', 'project', [
      'controlChars',
      'resourceId',
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('?');
  });

  it('runs path check', () => {
    const result = validateInput('../../etc/passwd', 'path', ['path']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Path traversal');
  });

  it('runs double encoding check', () => {
    const result = validateInput('%2e%2e/', 'path', ['doubleEncoding']);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Percent-encoded');
  });

  it('returns valid for empty checks array', () => {
    const result = validateInput('anything', 'field', []);
    expect(result.valid).toBe(true);
  });

  it('stops at first failure in multi-check', () => {
    // Path traversal should fail before double encoding is even checked
    const result = validateInput('../../secret', 'path', [
      'path',
      'doubleEncoding',
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Path traversal');
  });
});
