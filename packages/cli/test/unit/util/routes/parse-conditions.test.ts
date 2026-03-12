import { describe, expect, it } from 'vitest';
import {
  parseCondition,
  parseConditions,
  formatCondition,
} from '../../../../src/util/routes/parse-conditions';

describe('parse-conditions', () => {
  describe('parseCondition', () => {
    describe('header conditions', () => {
      it('should parse header condition with key only', () => {
        const result = parseCondition('header:Authorization');
        expect(result).toEqual({
          type: 'header',
          key: 'Authorization',
        });
      });

      it('should parse header condition with key and value', () => {
        const result = parseCondition('header:X-API-Key:secret.*');
        expect(result).toEqual({
          type: 'header',
          key: 'X-API-Key',
          value: 'secret.*',
        });
      });

      it('should parse header condition with value containing colons', () => {
        const result = parseCondition('header:Accept:text/html:charset=utf-8');
        expect(result).toEqual({
          type: 'header',
          key: 'Accept',
          value: 'text/html:charset=utf-8',
        });
      });

      it('should be case insensitive for type', () => {
        const result = parseCondition('HEADER:Content-Type');
        expect(result).toEqual({
          type: 'header',
          key: 'Content-Type',
        });
      });
    });

    describe('cookie conditions', () => {
      it('should parse cookie condition with key only', () => {
        const result = parseCondition('cookie:session');
        expect(result).toEqual({
          type: 'cookie',
          key: 'session',
        });
      });

      it('should parse cookie condition with key and value', () => {
        const result = parseCondition('cookie:beta:true');
        expect(result).toEqual({
          type: 'cookie',
          key: 'beta',
          value: 'true',
        });
      });
    });

    describe('query conditions', () => {
      it('should parse query condition with key only', () => {
        const result = parseCondition('query:debug');
        expect(result).toEqual({
          type: 'query',
          key: 'debug',
        });
      });

      it('should parse query condition with key and value', () => {
        const result = parseCondition('query:version:2');
        expect(result).toEqual({
          type: 'query',
          key: 'version',
          value: '2',
        });
      });

      it('should parse query condition with value containing equals', () => {
        const result = parseCondition('query:redirect:url=https://example.com');
        expect(result).toEqual({
          type: 'query',
          key: 'redirect',
          value: 'url=https://example.com',
        });
      });
    });

    describe('host conditions', () => {
      it('should parse host condition', () => {
        const result = parseCondition('host:api.example.com');
        expect(result).toEqual({
          type: 'host',
          value: 'api.example.com',
        });
      });

      it('should parse host condition with regex pattern', () => {
        const result = parseCondition('host:.*\\.staging\\.example\\.com');
        expect(result).toEqual({
          type: 'host',
          value: '.*\\.staging\\.example\\.com',
        });
      });

      it('should parse host condition with port', () => {
        const result = parseCondition('host:localhost:3000');
        expect(result).toEqual({
          type: 'host',
          value: 'localhost:3000',
        });
      });
    });

    describe('error handling', () => {
      it('should throw for invalid format without colon', () => {
        expect(() => parseCondition('invalid')).toThrow(
          'Invalid condition format'
        );
      });

      it('should throw for invalid type', () => {
        expect(() => parseCondition('invalid:key')).toThrow(
          'Invalid condition type: "invalid"'
        );
      });

      it('should throw for header without key', () => {
        expect(() => parseCondition('header:')).toThrow(
          'header condition requires a key'
        );
      });

      it('should throw for cookie without key', () => {
        expect(() => parseCondition('cookie:')).toThrow(
          'cookie condition requires a key'
        );
      });

      it('should throw for query without key', () => {
        expect(() => parseCondition('query:')).toThrow(
          'query condition requires a key'
        );
      });

      it('should throw for host without value', () => {
        expect(() => parseCondition('host:')).toThrow(
          'Host condition requires a value'
        );
      });

      it('should throw for invalid regex in condition value', () => {
        expect(() => parseCondition('header:X-Pattern:[invalid(regex')).toThrow(
          'Invalid regex'
        );
      });

      it('should throw for invalid regex in host value', () => {
        expect(() => parseCondition('host:[invalid(regex')).toThrow(
          'Invalid regex'
        );
      });

      it('should accept valid regex patterns', () => {
        const result = parseCondition('header:Accept:text/html.*');
        expect(result).toEqual({
          type: 'header',
          key: 'Accept',
          value: 'text/html.*',
        });
      });

      it('should accept complex valid regex patterns', () => {
        const result = parseCondition(
          'header:User-Agent:^Mozilla/5\\.0.*Chrome'
        );
        expect(result).toEqual({
          type: 'header',
          key: 'User-Agent',
          value: '^Mozilla/5\\.0.*Chrome',
        });
      });
    });
  });

  describe('operator syntax (op=value)', () => {
    it('should parse eq operator for header', () => {
      const result = parseCondition('header:X-Custom:eq=exact-value');
      expect(result).toEqual({
        type: 'header',
        key: 'X-Custom',
        value: '^exact-value$',
      });
    });

    it('should parse contains operator for header', () => {
      const result = parseCondition('header:Accept:contains=json');
      expect(result).toEqual({
        type: 'header',
        key: 'Accept',
        value: '.*json.*',
      });
    });

    it('should parse re operator for header', () => {
      const result = parseCondition('header:Accept:re=^text/html.*');
      expect(result).toEqual({
        type: 'header',
        key: 'Accept',
        value: '^text/html.*',
      });
    });

    it('should parse exists operator for header', () => {
      const result = parseCondition('header:Authorization:exists');
      expect(result).toEqual({
        type: 'header',
        key: 'Authorization',
      });
    });

    it('should parse eq operator for cookie', () => {
      const result = parseCondition('cookie:session:eq=abc123');
      expect(result).toEqual({
        type: 'cookie',
        key: 'session',
        value: '^abc123$',
      });
    });

    it('should parse contains operator for query', () => {
      const result = parseCondition('query:search:contains=test');
      expect(result).toEqual({
        type: 'query',
        key: 'search',
        value: '.*test.*',
      });
    });

    it('should parse eq operator for host', () => {
      const result = parseCondition('host:eq=example.com');
      expect(result).toEqual({
        type: 'host',
        value: '^example\\.com$',
      });
    });

    it('should parse contains operator for host', () => {
      const result = parseCondition('host:contains=staging');
      expect(result).toEqual({
        type: 'host',
        value: '.*staging.*',
      });
    });

    it('should parse re operator for host', () => {
      const result = parseCondition('host:re=.*\\.example\\.com');
      expect(result).toEqual({
        type: 'host',
        value: '.*\\.example\\.com',
      });
    });

    it('should handle eq value containing equals sign', () => {
      const result = parseCondition(
        'query:redirect:eq=url=https://example.com'
      );
      expect(result).toEqual({
        type: 'query',
        key: 'redirect',
        // escapeRegExp escapes: . * + ? ^ $ { } ( ) | [ ] \
        // = and : and / are NOT escaped by escapeRegExp
        value: '^url=https://example\\.com$',
      });
    });

    it('should handle eq value containing colons', () => {
      const result = parseCondition('header:Location:eq=https://example.com');
      // colons are rejoined: "eq=https://example.com"
      // operator is "eq", value is "https://example.com"
      expect(result.type).toBe('header');
      expect(result).toHaveProperty('key', 'Location');
      expect(result).toHaveProperty('value');
      // The value should be anchored and escaped
      expect((result as any).value).toMatch(/^\^/);
      expect((result as any).value).toMatch(/\$$/);
    });

    it('should treat unknown operator prefix as raw regex', () => {
      // "foo=bar" is not a known operator, so treat as raw regex
      const result = parseCondition('header:X-Custom:foo=bar');
      expect(result).toEqual({
        type: 'header',
        key: 'X-Custom',
        value: 'foo=bar',
      });
    });

    it('should error when host uses exists operator', () => {
      expect(() => parseCondition('host:exists')).toThrow(
        'does not support "exists"'
      );
    });

    it('should error when eq operator has no value after =', () => {
      expect(() => parseCondition('header:X-Custom:eq=')).toThrow(
        'requires a value'
      );
    });

    it('should error when contains operator has no value after =', () => {
      expect(() => parseCondition('header:X-Custom:contains=')).toThrow(
        'requires a value'
      );
    });

    it('should backward-compatible with bare regex values', () => {
      // Bare value without operator prefix should still work as raw regex
      const result = parseCondition('header:Accept:text/html');
      expect(result).toEqual({
        type: 'header',
        key: 'Accept',
        value: 'text/html',
      });
    });
  });

  describe('parseConditions', () => {
    it('should parse multiple conditions', () => {
      const conditions = [
        'header:Authorization',
        'cookie:session:active',
        'query:version:2',
        'host:api.example.com',
      ];
      const result = parseConditions(conditions);
      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ type: 'header', key: 'Authorization' });
      expect(result[1]).toEqual({
        type: 'cookie',
        key: 'session',
        value: 'active',
      });
      expect(result[2]).toEqual({ type: 'query', key: 'version', value: '2' });
      expect(result[3]).toEqual({ type: 'host', value: 'api.example.com' });
    });

    it('should return empty array for empty input', () => {
      const result = parseConditions([]);
      expect(result).toEqual([]);
    });

    it('should throw on first invalid condition', () => {
      const conditions = ['header:Authorization', 'invalid:key'];
      expect(() => parseConditions(conditions)).toThrow(
        'Invalid condition type'
      );
    });
  });

  describe('formatCondition', () => {
    it('should format header condition without value', () => {
      const result = formatCondition({ type: 'header', key: 'Authorization' });
      expect(result).toBe('header:Authorization');
    });

    it('should format header condition with value', () => {
      const result = formatCondition({
        type: 'header',
        key: 'X-API-Key',
        value: 'secret.*',
      });
      expect(result).toBe('header:X-API-Key:secret.*');
    });

    it('should format cookie condition', () => {
      const result = formatCondition({
        type: 'cookie',
        key: 'session',
        value: 'active',
      });
      expect(result).toBe('cookie:session:active');
    });

    it('should format query condition', () => {
      const result = formatCondition({ type: 'query', key: 'debug' });
      expect(result).toBe('query:debug');
    });

    it('should format host condition', () => {
      const result = formatCondition({
        type: 'host',
        value: 'api.example.com',
      });
      expect(result).toBe('host:api.example.com');
    });

    it('should roundtrip: parse then format', () => {
      const original = 'header:X-API-Key:secret.*';
      const parsed = parseCondition(original);
      const formatted = formatCondition(parsed);
      expect(formatted).toBe(original);
    });
  });
});
