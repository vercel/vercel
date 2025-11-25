import { join } from 'path';
import { writeFile, remove } from 'fs-extra';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { compileVercelConfig } from '../../../src/util/compile-vercel-config';
import { getNewTmpDir } from '../../helpers/get-tmp-dir';
import { VERCEL_DIR } from '../../../src/util/projects/link';

describe('compileVercelConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = getNewTmpDir();
    process.env.VERCEL_TS_CONFIG_ENABLED = '1';
  });

  afterEach(async () => {
    delete process.env.VERCEL_TS_CONFIG_ENABLED;
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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
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

  it('should ignore vercel.ts if feature flag is disabled', async () => {
    delete process.env.VERCEL_TS_CONFIG_ENABLED;
    const vercelTsPath = join(tmpDir, 'vercel.ts');
    await writeFile(vercelTsPath, 'export default {}');

    const result = await compileVercelConfig(tmpDir);
    expect(result.wasCompiled).toBe(false);
    expect(result.configPath).toBe(null);
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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
});
