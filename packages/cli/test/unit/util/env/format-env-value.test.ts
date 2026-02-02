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

    it('returns "remote" as-is (fixing the reported bug)', () => {
      expect(formatEnvValue('remote')).toBe('remote');
    });
  });

  describe('JSON values', () => {
    it('returns JSON array with spaces as-is (Prisma binary targets)', () => {
      expect(
        formatEnvValue('["rhel-openssl-3.0.x", "rhel-openssl-1.0.x"]')
      ).toBe('["rhel-openssl-3.0.x", "rhel-openssl-1.0.x"]');
    });

    it('returns JSON object with spaces as-is', () => {
      expect(formatEnvValue('{ "key": "value" }')).toBe('{ "key": "value" }');
    });

    it('escapes newlines in multiline JSON without quoting (self-delimiting)', () => {
      const json = '{\n  "key": "value"\n}';
      expect(formatEnvValue(json)).toBe('{\\n  "key": "value"\\n}');
    });
  });

  describe('values requiring quotes', () => {
    it('quotes value with space', () => {
      expect(formatEnvValue('hello world')).toBe('"hello world"');
    });

    it('quotes value starting with #', () => {
      expect(formatEnvValue('#notacomment')).toBe('"#notacomment"');
    });

    it('quotes value starting with "', () => {
      expect(formatEnvValue('"quoted"')).toBe('"\\"quoted\\""');
    });
  });

  describe('newline handling', () => {
    it('quotes and escapes newline', () => {
      expect(formatEnvValue('hello\nworld')).toBe('"hello\\nworld"');
    });
  });

  describe('quote escaping', () => {
    it('escapes double quotes in quoted value', () => {
      expect(formatEnvValue('say "hello"')).toBe('"say \\"hello\\""');
    });
  });
});
