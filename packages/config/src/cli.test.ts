import { describe, it, expect } from 'vitest';
import { normalizeConfig } from './cli';

describe('normalizeConfig', () => {
  it('should normalize rewrites array when it contains mixed Rewrite and Route formats', () => {
    const config = {
      rewrites: [
        { source: '/simple', destination: '/dest' },
        { src: '/complex', dest: '/dest', transforms: [] },
      ],
    };

    const result = normalizeConfig(config);

    expect(result.rewrites).toBeUndefined();
    expect(result.routes).toEqual([
      { src: '/simple', dest: '/dest' },
      { src: '/complex', dest: '/dest', transforms: [] },
    ]);
  });

  it('should leave pure Rewrite arrays unchanged', () => {
    const config = {
      rewrites: [
        { source: '/a', destination: '/b' },
        { source: '/c', destination: '/d' },
      ],
    };

    const result = normalizeConfig(config);

    expect(result.rewrites).toEqual(config.rewrites);
    expect(result.routes).toBeUndefined();
  });

  it('should move pure Route arrays from rewrites to routes', () => {
    const config = {
      rewrites: [
        { src: '/a', dest: '/b' },
        { src: '/c', dest: '/d' },
      ],
    };

    const result = normalizeConfig(config);

    expect(result.rewrites).toBeUndefined();
    expect(result.routes).toEqual([
      { src: '/a', dest: '/b' },
      { src: '/c', dest: '/d' },
    ]);
  });

  it('should preserve has/missing/respectOriginCacheControl when converting rewrites', () => {
    const config = {
      rewrites: [
        {
          source: '/api/(.*)',
          destination: '/backend/$1',
          has: [{ type: 'header', key: 'X-Custom' }],
          missing: [{ type: 'cookie', key: 'auth' }],
          respectOriginCacheControl: false,
        },
        { src: '/other', dest: '/dest' },
      ],
    };

    const result = normalizeConfig(config);

    expect(result.routes).toEqual([
      {
        src: '/api/(.*)',
        dest: '/backend/$1',
        has: [{ type: 'header', key: 'X-Custom' }],
        missing: [{ type: 'cookie', key: 'auth' }],
        respectOriginCacheControl: false,
      },
      { src: '/other', dest: '/dest' },
    ]);
  });

  it('should normalize redirects array when it contains mixed Redirect and Route formats', () => {
    const config = {
      redirects: [
        { source: '/old', destination: '/new', permanent: true },
        { src: '/complex', dest: '/dest', redirect: true, status: 308 },
      ],
    };

    const result = normalizeConfig(config);

    expect(result.redirects).toBeUndefined();
    expect(result.routes).toEqual([
      { src: '/old', dest: '/new', redirect: true, status: 308 },
      { src: '/complex', dest: '/dest', redirect: true, status: 308 },
    ]);
  });

  it('should not merge when routes and rewrites both exist explicitly', () => {
    const config = {
      routes: [{ src: '/a', dest: '/b' }],
      rewrites: [{ source: '/c', destination: '/d' }],
    };

    const result = normalizeConfig(config);

    expect(result.routes).toEqual([{ src: '/a', dest: '/b' }]);
    expect(result.rewrites).toEqual([{ source: '/c', destination: '/d' }]);
  });

  it('should handle empty config', () => {
    expect(normalizeConfig({})).toEqual({});
  });

  it('should handle empty arrays', () => {
    const config = { rewrites: [], redirects: [] };
    const result = normalizeConfig(config);

    expect(result.rewrites).toEqual([]);
    expect(result.redirects).toEqual([]);
  });

  it('should preserve other config fields during normalization', () => {
    const config = {
      framework: 'nextjs',
      buildCommand: 'npm run build',
      rewrites: [{ src: '/a', dest: '/b' }],
    };

    const result = normalizeConfig(config);

    expect(result.framework).toBe('nextjs');
    expect(result.buildCommand).toBe('npm run build');
    expect(result.routes).toEqual([{ src: '/a', dest: '/b' }]);
  });
});
