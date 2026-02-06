import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tryDetectServices } from '../../../../src/util/projects/detect-services';

describe('tryDetectServices()', () => {
  const originalEnv = process.env.VERCEL_USE_EXPERIMENTAL_SERVICES;
  let tempDir: string;

  beforeEach(async () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '1';
    tempDir = join(tmpdir(), `detect-services-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.VERCEL_USE_EXPERIMENTAL_SERVICES;
    } else {
      process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = originalEnv;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should return null when no vercel.json exists and no service found', async () => {
    const result = await tryDetectServices(tempDir);
    expect(result).toBeNull();
  });

  it('should return null when vercel.json has no experimentalServices and no service found', async () => {
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({ buildCommand: 'npm run build' })
    );

    const result = await tryDetectServices(tempDir);
    expect(result).toBeNull();
  });

  it('should return services when configured', async () => {
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({
        experimentalServices: {
          frontend: { framework: 'nextjs', routePrefix: '/' },
          backend: { entrypoint: 'api/index.py', routePrefix: '/api' },
        },
      })
    );

    const result = await tryDetectServices(tempDir);
    expect(result).not.toBeNull();
    expect(result?.services).toHaveLength(2);
    expect(result?.services.find(s => s.name === 'frontend')).toMatchObject({
      name: 'frontend',
      framework: 'nextjs',
      routePrefix: '/',
    });
    expect(result?.services.find(s => s.name === 'backend')).toMatchObject({
      name: 'backend',
      entrypoint: 'api/index.py',
      routePrefix: '/api',
    });
  });

  it('should return validation errors for invalid services', async () => {
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({
        experimentalServices: {
          // Missing routePrefix for web service
          'invalid-service': { entrypoint: 'index.ts' },
        },
      })
    );

    const result = await tryDetectServices(tempDir);
    expect(result).not.toBeNull();
    expect(result?.services).toHaveLength(0);
    expect(result?.errors.length).toBeGreaterThan(0);
  });
});
