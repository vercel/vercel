import { describe, expect, it } from 'vitest';
import {
  collectTransforms,
  collectResponseHeaders,
} from '../../../../src/util/routes/parse-transforms';

describe('parse-transforms', () => {
  describe('collectTransforms', () => {
    describe('response headers', () => {
      it('should collect set response header transforms', () => {
        const result = collectTransforms({
          setResponseHeader: ['Cache-Control=public, max-age=3600'],
        });
        expect(result).toEqual([
          {
            type: 'response.headers',
            op: 'set',
            target: { key: 'Cache-Control' },
            args: 'public, max-age=3600',
          },
        ]);
      });

      it('should collect append response header transforms', () => {
        const result = collectTransforms({
          appendResponseHeader: ['X-Custom=value'],
        });
        expect(result).toEqual([
          {
            type: 'response.headers',
            op: 'append',
            target: { key: 'X-Custom' },
            args: 'value',
          },
        ]);
      });

      it('should collect delete response header transforms', () => {
        const result = collectTransforms({
          deleteResponseHeader: ['X-Powered-By'],
        });
        expect(result).toEqual([
          {
            type: 'response.headers',
            op: 'delete',
            target: { key: 'X-Powered-By' },
          },
        ]);
      });

      it('should handle multiple response header transforms', () => {
        const result = collectTransforms({
          setResponseHeader: ['Cache-Control=no-store'],
          appendResponseHeader: ['X-Debug=info'],
          deleteResponseHeader: ['Server'],
        });
        expect(result).toHaveLength(3);
        expect(result[0].op).toBe('set');
        expect(result[1].op).toBe('append');
        expect(result[2].op).toBe('delete');
      });
    });

    describe('request headers', () => {
      it('should collect set request header transforms', () => {
        const result = collectTransforms({
          setRequestHeader: ['X-Forwarded-Host=example.com'],
        });
        expect(result).toEqual([
          {
            type: 'request.headers',
            op: 'set',
            target: { key: 'X-Forwarded-Host' },
            args: 'example.com',
          },
        ]);
      });

      it('should collect append request header transforms', () => {
        const result = collectTransforms({
          appendRequestHeader: ['X-Debug-Info=cli-request'],
        });
        expect(result).toEqual([
          {
            type: 'request.headers',
            op: 'append',
            target: { key: 'X-Debug-Info' },
            args: 'cli-request',
          },
        ]);
      });

      it('should collect delete request header transforms', () => {
        const result = collectTransforms({
          deleteRequestHeader: ['Cookie'],
        });
        expect(result).toEqual([
          {
            type: 'request.headers',
            op: 'delete',
            target: { key: 'Cookie' },
          },
        ]);
      });
    });

    describe('request query', () => {
      it('should collect set request query transforms', () => {
        const result = collectTransforms({
          setRequestQuery: ['version=2'],
        });
        expect(result).toEqual([
          {
            type: 'request.query',
            op: 'set',
            target: { key: 'version' },
            args: '2',
          },
        ]);
      });

      it('should collect append request query transforms', () => {
        const result = collectTransforms({
          appendRequestQuery: ['tags=new'],
        });
        expect(result).toEqual([
          {
            type: 'request.query',
            op: 'append',
            target: { key: 'tags' },
            args: 'new',
          },
        ]);
      });

      it('should collect delete request query transforms', () => {
        const result = collectTransforms({
          deleteRequestQuery: ['secret_token'],
        });
        expect(result).toEqual([
          {
            type: 'request.query',
            op: 'delete',
            target: { key: 'secret_token' },
          },
        ]);
      });

      it('should handle query value with equals sign', () => {
        const result = collectTransforms({
          setRequestQuery: ['redirect=url=https://example.com'],
        });
        expect(result).toEqual([
          {
            type: 'request.query',
            op: 'set',
            target: { key: 'redirect' },
            args: 'url=https://example.com',
          },
        ]);
      });
    });

    describe('combined transforms', () => {
      it('should collect all transform types', () => {
        const result = collectTransforms({
          setResponseHeader: ['Cache-Control=no-store'],
          deleteResponseHeader: ['X-Powered-By'],
          setRequestHeader: ['X-Forwarded-Host=example.com'],
          setRequestQuery: ['version=2'],
          deleteRequestQuery: ['debug'],
        });
        expect(result).toHaveLength(5);
        expect(result.filter(t => t.type === 'response.headers')).toHaveLength(
          2
        );
        expect(result.filter(t => t.type === 'request.headers')).toHaveLength(
          1
        );
        expect(result.filter(t => t.type === 'request.query')).toHaveLength(2);
      });

      it('should return empty array when no flags provided', () => {
        const result = collectTransforms({});
        expect(result).toEqual([]);
      });

      it('should return empty array when flags are undefined', () => {
        const result = collectTransforms({
          setResponseHeader: undefined,
          appendResponseHeader: undefined,
        });
        expect(result).toEqual([]);
      });
    });

    describe('error handling', () => {
      it('should throw for set without value', () => {
        expect(() =>
          collectTransforms({
            setResponseHeader: ['InvalidNoValue'],
          })
        ).toThrow('Invalid format');
      });

      it('should throw for empty key', () => {
        expect(() =>
          collectTransforms({
            setResponseHeader: ['=value'],
          })
        ).toThrow('key cannot be empty');
      });

      it('should throw for delete with empty key', () => {
        expect(() =>
          collectTransforms({
            deleteResponseHeader: [''],
          })
        ).toThrow('Delete operation requires a key');
      });

      it('should throw for delete with whitespace-only key', () => {
        expect(() =>
          collectTransforms({
            deleteResponseHeader: ['   '],
          })
        ).toThrow('Delete operation requires a key');
      });
    });
  });

  describe('collectResponseHeaders', () => {
    it('should collect headers into a record', () => {
      const result = collectResponseHeaders([
        'Cache-Control=public, max-age=3600',
        'X-Custom-Header=custom-value',
      ]);
      expect(result).toEqual({
        'Cache-Control': 'public, max-age=3600',
        'X-Custom-Header': 'custom-value',
      });
    });

    it('should handle value with equals sign', () => {
      const result = collectResponseHeaders([
        'Link=<https://example.com>; rel="preload"',
      ]);
      expect(result).toEqual({
        Link: '<https://example.com>; rel="preload"',
      });
    });

    it('should handle empty value', () => {
      const result = collectResponseHeaders(['X-Empty=']);
      expect(result).toEqual({
        'X-Empty': '',
      });
    });

    it('should return empty object for empty input', () => {
      const result = collectResponseHeaders([]);
      expect(result).toEqual({});
    });

    it('should throw for missing equals sign', () => {
      expect(() => collectResponseHeaders(['InvalidNoEquals'])).toThrow(
        'Invalid header format'
      );
    });

    it('should throw for empty key', () => {
      expect(() => collectResponseHeaders(['=value'])).toThrow(
        'Header key cannot be empty'
      );
    });

    it('should overwrite duplicate keys', () => {
      const result = collectResponseHeaders([
        'Cache-Control=no-cache',
        'Cache-Control=no-store',
      ]);
      expect(result).toEqual({
        'Cache-Control': 'no-store',
      });
    });
  });
});
