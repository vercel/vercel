import type { VercelConfig } from '@vercel/client';
import { remove, writeFile } from 'fs-extra';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  compileVercelConfig,
  normalizeConfig,
} from '../../../src/util/compile-vercel-config';
import { VERCEL_DIR } from '../../../src/util/projects/link';
import { getNewTmpDir } from '../../helpers/get-tmp-dir';

describe('normalizeConfig', () => {
  it('should normalize rewrites array when it contains mixed Rewrite and Route formats', () => {
    const config = {
      rewrites: [
        { source: '/simple', destination: '/dest' },
        { src: '/complex', dest: '/dest', transforms: [] },
      ],
    } as VercelConfig;

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
    } as unknown as VercelConfig;

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
    } as VercelConfig;

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

  it('should preserve statusCode when converting rewrites', () => {
    const config = {
      rewrites: [
        {
          source: '/api/old',
          destination: '/api/new',
          statusCode: 301,
        },
        {
          source: '/public',
          destination: '/backend',
          statusCode: 200,
          respectOriginCacheControl: false,
        },
        { src: '/other', dest: '/dest' },
      ],
    } as VercelConfig;

    const result = normalizeConfig(config);

    expect(result.routes).toEqual([
      {
        src: '/api/old',
        dest: '/api/new',
        status: 301,
      },
      {
        src: '/public',
        dest: '/backend',
        status: 200,
        respectOriginCacheControl: false,
      },
      { src: '/other', dest: '/dest' },
    ]);
  });

  it('should normalize redirects array when it contains mixed Redirect and Route formats', () => {
    const config = {
      redirects: [
        { source: '/old', destination: '/new', permanent: true },
        { src: '/complex', dest: '/dest', status: 308 },
      ],
    } as VercelConfig;

    const result = normalizeConfig(config);

    expect(result.redirects).toBeUndefined();
    expect(result.routes).toEqual([
      { src: '/old', dest: '/new', status: 308 },
      { src: '/complex', dest: '/dest', status: 308 },
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

  it('should throw helpful error when rewrites with transforms conflict with redirects', () => {
    const config = {
      rewrites: [{ src: '/with-transform', dest: '/dest', transforms: [] }],
      redirects: [{ source: '/old', destination: '/new', permanent: true }],
    } as unknown as VercelConfig;

    expect(() => normalizeConfig(config)).toThrow(
      /Move everything into the `routes` array/
    );
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
    } as unknown as VercelConfig;

    const result = normalizeConfig(config);

    expect(result.framework).toBe('nextjs');
    expect(result.buildCommand).toBe('npm run build');
    expect(result.routes).toEqual([{ src: '/a', dest: '/b' }]);
  });

  it('should normalize mixed Route and Redirect formats in routes array', () => {
    // This simulates: routes.rewrite() with transforms (Route format) + routes.redirect() without transforms (Redirect format)
    const config = {
      routes: [
        {
          src: '/test-header',
          dest: 'https://httpbin.org/headers',
          requestHeaders: { authorization: 'Bearer token' },
        },
        {
          source: '/test-build',
          destination: 'https://httpbin.org/headers',
          permanent: false,
        },
      ],
    } as unknown as VercelConfig;

    const result = normalizeConfig(config);

    expect(result.routes).toEqual([
      {
        src: '/test-header',
        dest: 'https://httpbin.org/headers',
        requestHeaders: { authorization: 'Bearer token' },
      },
      {
        src: '/test-build',
        dest: 'https://httpbin.org/headers',
        status: 307,
      },
    ]);
  });

  it('should normalize Rewrite format items in routes array', () => {
    const config = {
      routes: [
        { src: '/route-format', dest: '/dest' },
        { source: '/rewrite-format', destination: '/dest' },
      ],
    } as VercelConfig;

    const result = normalizeConfig(config);

    expect(result.routes).toEqual([
      { src: '/route-format', dest: '/dest' },
      { src: '/rewrite-format', dest: '/dest' },
    ]);
  });

  it('should normalize redirects in routes array', () => {
    const config = {
      routes: [
        {
          source: '/old',
          destination: '/new',
          statusCode: 301,
          permanent: true,
        },
      ],
    } as unknown as VercelConfig;

    const result = normalizeConfig(config);

    expect(result.routes).toEqual([{ src: '/old', dest: '/new', status: 301 }]);
  });

  it('should normalize headers in routes array', () => {
    const config = {
      routes: [
        { src: '/api', dest: '/dest' },
        {
          source: '/path',
          headers: [
            { key: 'X-Custom', value: 'hello' },
            { key: 'X-Other', value: 'world' },
          ],
        },
      ],
    } as unknown as VercelConfig;

    const result = normalizeConfig(config);

    expect(result.routes).toEqual([
      { src: '/api', dest: '/dest' },
      { src: '/path', headers: { 'X-Custom': 'hello', 'X-Other': 'world' } },
    ]);
  });
});

describe('compileVercelConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = getNewTmpDir();
  });

  afterEach(async () => {
    await remove(tmpDir);
  });

  it('should compile vercel.ts to vercel.json', async () => {
    const vercelTsPath = join(tmpDir, 'vercel.ts');
    const vercelTsContent = `
      export default {
        headers: [
          {
            source: '/(.*)',
            headers: [
              {
                key: 'X-Test',
                value: 'true'
              }
            ]
          }
        ]
      };
    `;
    await writeFile(vercelTsPath, vercelTsContent);

    const result = await compileVercelConfig(tmpDir);

    expect(result.wasCompiled).toBe(true);
    expect(result.configPath).toBe(join(tmpDir, VERCEL_DIR, 'vercel.json'));

    const compiledConfig = require(result.configPath!);
    expect(compiledConfig).toEqual({
      headers: [
        {
          source: '/(.*)',
          headers: [
            {
              key: 'X-Test',
              value: 'true',
            },
          ],
        },
      ],
    });
  });

  it('should throw error if both vercel.ts and vercel.json exist', async () => {
    const vercelTsPath = join(tmpDir, 'vercel.ts');
    const vercelJsonPath = join(tmpDir, 'vercel.json');
    await writeFile(vercelTsPath, 'export default {}');
    await writeFile(vercelJsonPath, '{}');

    await expect(compileVercelConfig(tmpDir)).rejects.toThrow(
      /Both vercel.ts and vercel.json exist/
    );
  });

  it('should compile vercel.mjs to vercel.json', async () => {
    const vercelMjsPath = join(tmpDir, 'vercel.mjs');
    const vercelMjsContent = `
      export default {
        rewrites: [
          {
            source: '/api/:path*',
            destination: '/backend/:path*'
          }
        ]
      };
    `;
    await writeFile(vercelMjsPath, vercelMjsContent);

    const result = await compileVercelConfig(tmpDir);

    expect(result.wasCompiled).toBe(true);
    expect(result.configPath).toBe(join(tmpDir, VERCEL_DIR, 'vercel.json'));

    const compiledConfig = require(result.configPath!);
    expect(compiledConfig).toEqual({
      rewrites: [
        {
          source: '/api/:path*',
          destination: '/backend/:path*',
        },
      ],
    });
  });

  it('should not merge routes and rewrites even if both contain transforms', async () => {
    const vercelTsPath = join(tmpDir, 'vercel.ts');
    const vercelTsContent = `
      export default {
        routes: [
          {
            src: '/api/(.*)',
            dest: 'https://backend.example.com/$1',
            headers: { 'x-custom': 'value' }
          }
        ],
        rewrites: [
          {
            src: '/other/(.*)',
            dest: 'https://other.example.com/$1',
            headers: { 'x-other': 'value' }
          }
        ]
      };
    `;
    await writeFile(vercelTsPath, vercelTsContent);

    const result = await compileVercelConfig(tmpDir);

    expect(result.wasCompiled).toBe(true);

    const compiledConfig = require(result.configPath!);

    expect(compiledConfig.routes).toEqual([
      {
        src: '/api/(.*)',
        dest: 'https://backend.example.com/$1',
        headers: { 'x-custom': 'value' },
      },
    ]);
    expect(compiledConfig.rewrites).toEqual([
      {
        src: '/other/(.*)',
        dest: 'https://other.example.com/$1',
        headers: { 'x-other': 'value' },
      },
    ]);
  });
});
