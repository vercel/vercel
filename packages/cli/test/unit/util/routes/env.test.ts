import { describe, it, expect } from 'vitest';
import {
  extractEnvVarNames,
  populateRouteEnv,
} from '../../../../src/util/routes/env';

type RouteForEnv = Parameters<typeof populateRouteEnv>[0];

describe('extractEnvVarNames', () => {
  it('should extract $VAR format', () => {
    expect(extractEnvVarNames('https://$BACKEND_HOST/api')).toEqual([
      'BACKEND_HOST',
    ]);
  });

  it('should extract ${VAR} format', () => {
    expect(extractEnvVarNames('https://${BACKEND_HOST}/api')).toEqual([
      'BACKEND_HOST',
    ]);
  });

  it('should extract multiple env vars', () => {
    const result = extractEnvVarNames(
      'https://$BACKEND_HOST:$BACKEND_PORT/api'
    );
    expect(result).toContain('BACKEND_HOST');
    expect(result).toContain('BACKEND_PORT');
    expect(result).toHaveLength(2);
  });

  it('should deduplicate env vars', () => {
    expect(extractEnvVarNames('$API_KEY and $API_KEY again')).toEqual([
      'API_KEY',
    ]);
  });

  it('should NOT extract lowercase vars (path params)', () => {
    expect(extractEnvVarNames('/api/$path/test')).toEqual([]);
  });

  it('should NOT extract mixed case vars', () => {
    expect(extractEnvVarNames('/api/$pathParam')).toEqual([]);
  });

  it('should extract uppercase with underscores and numbers', () => {
    expect(extractEnvVarNames('$API_KEY_V2')).toEqual(['API_KEY_V2']);
  });

  it('should return empty for no env vars', () => {
    expect(extractEnvVarNames('/api/users/:id')).toEqual([]);
  });

  it('should handle env var at start of string', () => {
    expect(extractEnvVarNames('$HOST/api')).toEqual(['HOST']);
  });

  it('should handle env var at end of string', () => {
    expect(extractEnvVarNames('https://api.com/$PATH')).toEqual(['PATH']);
  });
});

describe('populateRouteEnv', () => {
  it('should populate env from dest', () => {
    const route: RouteForEnv = { dest: 'https://$BACKEND_HOST/api' };
    populateRouteEnv(route);
    expect(route.env).toEqual(['BACKEND_HOST']);
  });

  it('should populate env from headers values', () => {
    const route: RouteForEnv = {
      headers: {
        Authorization: 'Bearer $API_TOKEN',
        'X-Custom': 'static-value',
      },
    };
    populateRouteEnv(route);
    expect(route.env).toEqual(['API_TOKEN']);
  });

  it('should combine env from dest and headers', () => {
    const route: RouteForEnv = {
      dest: 'https://$BACKEND_HOST/api',
      headers: { Authorization: 'Bearer $API_TOKEN' },
    };
    populateRouteEnv(route);
    expect(route.env).toContain('BACKEND_HOST');
    expect(route.env).toContain('API_TOKEN');
  });

  it('should populate per-transform env from args', () => {
    const route: RouteForEnv = {
      transforms: [{ args: 'Bearer $API_TOKEN' }, { args: 'static-value' }],
    };
    populateRouteEnv(route);
    expect(route.transforms![0].env).toEqual(['API_TOKEN']);
    expect(route.transforms![1].env).toBeUndefined();
  });

  it('should handle transform with array args', () => {
    const route: RouteForEnv = {
      transforms: [{ args: ['$VAR1', '$VAR2'] }],
    };
    populateRouteEnv(route);
    expect(route.transforms![0].env).toContain('VAR1');
    expect(route.transforms![0].env).toContain('VAR2');
  });

  it('should not set env when no vars found', () => {
    const route: RouteForEnv = {
      dest: '/api/users',
      headers: { 'Cache-Control': 'no-cache' },
    };
    populateRouteEnv(route);
    expect(route.env).toBeUndefined();
  });

  it('should not extract lowercase path params from dest', () => {
    const route: RouteForEnv = { dest: '/api/$path/users/$id' };
    populateRouteEnv(route);
    expect(route.env).toBeUndefined();
  });
});
