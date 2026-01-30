import { describe, expect, it } from 'vitest';
import {
  buildRequest,
  formatOutput,
  generateCurlCommand,
} from '../../../../src/commands/api/request-builder';
import type { RequestConfig } from '../../../../src/commands/api/types';

describe('request-builder', () => {
  describe('buildRequest', () => {
    it('builds GET request by default', async () => {
      const result = await buildRequest('/v2/user', {});

      expect(result.url).toBe('/v2/user');
      expect(result.method).toBe('GET');
      expect(result.body).toBeUndefined();
    });

    it('builds POST request when body is provided', async () => {
      const result = await buildRequest('/v10/projects', {
        '--field': ['name=my-project'],
      });

      expect(result.method).toBe('POST');
      expect(result.body).toEqual({ name: 'my-project' });
    });

    it('uses explicit method with --method flag', async () => {
      const result = await buildRequest('/v10/projects', {
        '--method': 'PUT',
        '--field': ['name=updated'],
      });

      expect(result.method).toBe('PUT');
    });

    it.each([
      // Boolean values
      {
        input: 'enabled=true',
        expected: { enabled: true },
        desc: 'true boolean',
      },
      {
        input: 'disabled=false',
        expected: { disabled: false },
        desc: 'false boolean',
      },
      // Integer values
      { input: 'count=42', expected: { count: 42 }, desc: 'positive integer' },
      {
        input: 'negative=-10',
        expected: { negative: -10 },
        desc: 'negative integer',
      },
      { input: 'zero=0', expected: { zero: 0 }, desc: 'zero' },
      // Float values
      {
        input: 'price=19.99',
        expected: { price: 19.99 },
        desc: 'positive float',
      },
      { input: 'rate=0.5', expected: { rate: 0.5 }, desc: 'decimal float' },
      { input: 'neg=-3.14', expected: { neg: -3.14 }, desc: 'negative float' },
      // Null values
      { input: 'value=null', expected: { value: null }, desc: 'null value' },
      // String values (not matching special patterns)
      {
        input: 'name=hello',
        expected: { name: 'hello' },
        desc: 'simple string',
      },
      {
        input: 'text=hello world',
        expected: { text: 'hello world' },
        desc: 'string with space',
      },
      {
        input: 'notbool=trueish',
        expected: { notbool: 'trueish' },
        desc: 'string starting with true',
      },
      {
        input: 'notnum=42abc',
        expected: { notnum: '42abc' },
        desc: 'string starting with number',
      },
      // JSON array values
      {
        input: 'events=["deployment.created"]',
        expected: { events: ['deployment.created'] },
        desc: 'JSON array with single string',
      },
      {
        input: 'events=["deployment.created","deployment.ready"]',
        expected: { events: ['deployment.created', 'deployment.ready'] },
        desc: 'JSON array with multiple strings',
      },
      {
        input: 'numbers=[1, 2, 3]',
        expected: { numbers: [1, 2, 3] },
        desc: 'JSON array with numbers',
      },
      {
        input: 'empty=[]',
        expected: { empty: [] },
        desc: 'empty JSON array',
      },
      // JSON object values
      {
        input: 'config={"key":"value"}',
        expected: { config: { key: 'value' } },
        desc: 'JSON object',
      },
      {
        input: 'nested={"outer":{"inner":"value"}}',
        expected: { nested: { outer: { inner: 'value' } } },
        desc: 'nested JSON object',
      },
      // Invalid JSON stays as string
      {
        input: 'invalid=[not valid json',
        expected: { invalid: '[not valid json' },
        desc: 'invalid JSON array stays as string',
      },
      {
        input: 'invalid={not valid json',
        expected: { invalid: '{not valid json' },
        desc: 'invalid JSON object stays as string',
      },
    ])('parses typed field: $desc', async ({ input, expected }) => {
      const result = await buildRequest('/api', { '--field': [input] });
      expect(result.body).toEqual(expected);
    });

    it.each([
      {
        input: 'number=42',
        expected: { number: '42' },
        desc: 'number as string',
      },
      {
        input: 'bool=true',
        expected: { bool: 'true' },
        desc: 'boolean as string',
      },
      {
        input: 'null=null',
        expected: { null: 'null' },
        desc: 'null as string',
      },
      {
        input: 'float=3.14',
        expected: { float: '3.14' },
        desc: 'float as string',
      },
    ])('keeps raw-field as string: $desc', async ({ input, expected }) => {
      const result = await buildRequest('/api', { '--raw-field': [input] });
      expect(result.body).toEqual(expected);
    });

    it.each([
      {
        desc: 'simple header',
        input: 'X-Custom: value',
        expected: { 'X-Custom': 'value' },
      },
      {
        desc: 'content-type header',
        input: 'Content-Type: application/json',
        expected: { 'Content-Type': 'application/json' },
      },
      {
        desc: 'header with colons in value',
        input: 'X-URL: https://example.com',
        expected: { 'X-URL': 'https://example.com' },
      },
      {
        desc: 'header with multiple colons in value',
        input: 'X-Time: 12:30:45',
        expected: { 'X-Time': '12:30:45' },
      },
      {
        desc: 'header with whitespace around colon',
        input: 'X-Spaced :   value  ',
        expected: { 'X-Spaced': 'value' },
      },
    ])('parses header: $desc', async ({ input, expected }) => {
      const result = await buildRequest('/api', { '--header': [input] });
      expect(result.headers).toEqual(expected);
    });

    it('throws error for invalid field format', async () => {
      await expect(
        buildRequest('/api', { '--field': ['invalid'] })
      ).rejects.toThrow('Invalid field format');
    });
  });

  describe('formatOutput', () => {
    it('pretty prints JSON by default', () => {
      const result = formatOutput({ key: 'value' }, {});
      expect(result).toBe('{\n  "key": "value"\n}');
    });

    it('outputs compact JSON with raw option', () => {
      const result = formatOutput({ key: 'value' }, { raw: true });
      expect(result).toBe('{"key":"value"}');
    });

    it('returns string values as-is with raw option', () => {
      const result = formatOutput('plain text', { raw: true });
      expect(result).toBe('plain text');
    });
  });

  describe('generateCurlCommand', () => {
    const baseUrl = 'https://api.vercel.com';

    it.each<{ desc: string; config: RequestConfig; contains: string[] }>([
      {
        desc: 'simple GET request',
        config: { url: '/v2/user', method: 'GET', headers: {} },
        contains: ['curl', "'https://api.vercel.com/v2/user'"],
      },
      {
        desc: 'POST request with method flag',
        config: { url: '/v10/projects', method: 'POST', headers: {} },
        contains: ['-X POST', "'https://api.vercel.com/v10/projects'"],
      },
      {
        desc: 'PUT request',
        config: { url: '/v10/projects/prj_123', method: 'PUT', headers: {} },
        contains: ['-X PUT'],
      },
      {
        desc: 'DELETE request',
        config: { url: '/v10/projects/prj_123', method: 'DELETE', headers: {} },
        contains: ['-X DELETE'],
      },
      {
        desc: 'PATCH request',
        config: { url: '/v10/projects/prj_123', method: 'PATCH', headers: {} },
        contains: ['-X PATCH'],
      },
    ])('generates curl for $desc', ({ config, contains }) => {
      const result = generateCurlCommand(config, baseUrl);
      for (const expected of contains) {
        expect(result).toContain(expected);
      }
    });

    it.each<{ desc: string; config: RequestConfig; contains: string[] }>([
      {
        desc: 'single header',
        config: {
          url: '/api',
          method: 'GET',
          headers: { 'X-Custom': 'value' },
        },
        contains: ["-H 'X-Custom: value'"],
      },
      {
        desc: 'multiple headers',
        config: {
          url: '/api',
          method: 'GET',
          headers: { 'X-One': 'first', 'X-Two': 'second' },
        },
        contains: ["-H 'X-One: first'", "-H 'X-Two: second'"],
      },
      {
        desc: 'header with special characters',
        config: {
          url: '/api',
          method: 'GET',
          headers: { Authorization: "Bearer abc'123" },
        },
        contains: ["-H 'Authorization: Bearer abc'\\''123'"],
      },
    ])('generates curl with $desc', ({ config, contains }) => {
      const result = generateCurlCommand(config, baseUrl);
      for (const expected of contains) {
        expect(result).toContain(expected);
      }
    });

    it.each<{ desc: string; config: RequestConfig; contains: string[] }>([
      {
        desc: 'JSON object body',
        config: {
          url: '/api',
          method: 'POST',
          headers: {},
          body: { name: 'test' },
        },
        contains: [
          "-H 'Content-Type: application/json'",
          '-d \'{"name":"test"}\'',
        ],
      },
      {
        desc: 'string body',
        config: {
          url: '/api',
          method: 'POST',
          headers: {},
          body: 'raw body content',
        },
        contains: [
          "-H 'Content-Type: application/json'",
          "-d 'raw body content'",
        ],
      },
      {
        desc: 'body with special characters',
        config: {
          url: '/api',
          method: 'POST',
          headers: {},
          body: { message: "it's working" },
        },
        contains: ["-d '{\"message\":\"it'\\''s working\"}'"],
      },
      {
        desc: 'nested JSON body',
        config: {
          url: '/api',
          method: 'POST',
          headers: {},
          body: { outer: { inner: 'value' } },
        },
        contains: ['-d \'{"outer":{"inner":"value"}}\''],
      },
    ])('generates curl with $desc', ({ config, contains }) => {
      const result = generateCurlCommand(config, baseUrl);
      for (const expected of contains) {
        expect(result).toContain(expected);
      }
    });

    it('does not include -X flag for GET requests', () => {
      const config: RequestConfig = {
        url: '/v2/user',
        method: 'GET',
        headers: {},
      };
      const result = generateCurlCommand(config, baseUrl);
      expect(result).not.toContain('-X');
    });

    it('includes Authorization header with placeholder', () => {
      const config: RequestConfig = {
        url: '/v2/user',
        method: 'GET',
        headers: {},
      };
      const result = generateCurlCommand(config, baseUrl);
      expect(result).toContain("-H 'Authorization: Bearer <TOKEN>'");
    });

    it('joins parts with line continuation', () => {
      const config: RequestConfig = {
        url: '/api',
        method: 'POST',
        headers: { 'X-Test': 'value' },
        body: { key: 'value' },
      };
      const result = generateCurlCommand(config, baseUrl);
      expect(result).toContain(' \\\n  ');
    });
  });
});
