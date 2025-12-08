import { describe, expect, it } from 'vitest';
import { formatEnvValue } from '../../../../src/util/env/format-env-value';

describe('formatEnvValue', () => {
  describe('null/undefined/empty handling', () => {
    it('returns empty string for undefined', () => {
      expect(formatEnvValue(undefined)).toBe('');
    });

    it('returns empty string for null', () => {
      expect(formatEnvValue(null as unknown as undefined)).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(formatEnvValue('')).toBe('');
    });
  });

  describe('simple values (no quoting needed)', () => {
    it('returns simple string as-is', () => {
      expect(formatEnvValue('hello')).toBe('hello');
    });

    it('returns numeric string as-is', () => {
      expect(formatEnvValue('3000')).toBe('3000');
    });

    it('returns URL as-is', () => {
      expect(formatEnvValue('https://example.com')).toBe('https://example.com');
    });

    it('returns connection string as-is', () => {
      expect(formatEnvValue('redis://abc123@redis.example.com:6379')).toBe(
        'redis://abc123@redis.example.com:6379'
      );
    });

    it('returns JSON object as-is (no whitespace)', () => {
      expect(formatEnvValue('{"key":"value"}')).toBe('{"key":"value"}');
    });

    it('returns value with equals sign as-is', () => {
      expect(formatEnvValue('key=value')).toBe('key=value');
    });
  });

  describe('values requiring quotes', () => {
    it('quotes value with space', () => {
      expect(formatEnvValue('hello world')).toBe('"hello world"');
    });

    it('quotes value with tab', () => {
      expect(formatEnvValue('hello\tworld')).toBe('"hello\tworld"');
    });

    it('quotes value starting with #', () => {
      expect(formatEnvValue('#notacomment')).toBe('"#notacomment"');
    });

    it('quotes value with # after space', () => {
      expect(formatEnvValue('value #comment')).toBe('"value #comment"');
    });

    it('quotes JSON with spaces', () => {
      expect(formatEnvValue('{ "key": "value" }')).toBe(
        '"{ \\"key\\": \\"value\\" }"'
      );
    });
  });

  describe('newline handling', () => {
    it('quotes and escapes newline', () => {
      expect(formatEnvValue('hello\nworld')).toBe('"hello\\nworld"');
    });

    it('quotes and escapes carriage return', () => {
      expect(formatEnvValue('hello\rworld')).toBe('"hello\\rworld"');
    });

    it('quotes and escapes CRLF', () => {
      expect(formatEnvValue('hello\r\nworld')).toBe('"hello\\r\\nworld"');
    });

    it('quotes and escapes multiple newlines', () => {
      expect(formatEnvValue('a\nb\nc')).toBe('"a\\nb\\nc"');
    });

    it('quotes and escapes newline when value also has space', () => {
      expect(formatEnvValue('hello world\nfoo')).toBe('"hello world\\nfoo"');
    });
  });

  describe('quote escaping', () => {
    it('escapes double quotes in quoted value', () => {
      expect(formatEnvValue('say "hello"')).toBe('"say \\"hello\\""');
    });

    it('quotes and escapes value starting with double quote', () => {
      expect(formatEnvValue('"quoted"')).toBe('"\\"quoted\\""');
    });

    it('quotes and escapes value starting with double quote (unclosed)', () => {
      expect(formatEnvValue('"unclosed')).toBe('"\\"unclosed"');
    });

    it('does not quote value with middle quote only', () => {
      expect(formatEnvValue('hello"world')).toBe('hello"world');
    });

    it('escapes quotes in value starting with #', () => {
      expect(formatEnvValue('#say "hi"')).toBe('"#say \\"hi\\""');
    });
  });

  describe('combined edge cases', () => {
    it('handles value with newline and quotes', () => {
      expect(formatEnvValue('line1\n"quoted"')).toBe('"line1\\n\\"quoted\\""');
    });

    it('handles value with space, newline, and quotes', () => {
      expect(formatEnvValue('hello world\n"quoted"')).toBe(
        '"hello world\\n\\"quoted\\""'
      );
    });

    it('handles multiline JSON', () => {
      const json = '{\n  "key": "value"\n}';
      expect(formatEnvValue(json)).toBe('"{\\n  \\"key\\": \\"value\\"\\n}"');
    });

    it('handles private key format (has spaces, so quoted)', () => {
      const key =
        '-----BEGIN PRIVATE KEY-----\nABC123\n-----END PRIVATE KEY-----';
      expect(formatEnvValue(key)).toBe(
        '"-----BEGIN PRIVATE KEY-----\\nABC123\\n-----END PRIVATE KEY-----"'
      );
    });

    it('handles path with backslashes', () => {
      expect(formatEnvValue('C:\\Users\\name')).toBe('C:\\Users\\name');
    });

    it('handles path with backslashes and spaces', () => {
      expect(formatEnvValue('C:\\Program Files\\app')).toBe(
        '"C:\\Program Files\\app"'
      );
    });
  });
});
