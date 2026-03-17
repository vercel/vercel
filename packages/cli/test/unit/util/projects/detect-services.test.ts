import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import {
  detectServicesForSetup,
  isExperimentalServicesEnabled,
  tryDetectServices,
  writeServicesConfig,
} from '../../../../src/util/projects/detect-services';

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

  it('should return null for root-only project with no backend', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ dependencies: { next: '14.0.0' } })
    );

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
    await mkdir(join(tempDir, 'api'), { recursive: true });
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({
        experimentalServices: {
          frontend: { framework: 'nextjs', routePrefix: '/' },
          backend: { entrypoint: 'api/index.py', routePrefix: '/api' },
        },
      })
    );
    await writeFile(
      join(tempDir, 'api/index.py'),
      'def app():\n  return None\n'
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

  it('should return inferred layout services for setup without env gating', async () => {
    delete process.env.VERCEL_USE_EXPERIMENTAL_SERVICES;
    await mkdir(join(tempDir, 'services/api'), { recursive: true });
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ dependencies: { next: '14.0.0' } })
    );
    await writeFile(
      join(tempDir, 'services/api/requirements.txt'),
      'fastapi\n'
    );
    await writeFile(
      join(tempDir, 'services/api/index.py'),
      'from fastapi import FastAPI\napp = FastAPI()\n'
    );

    const setupResult = await detectServicesForSetup(tempDir);

    expect(setupResult.blockedByProjectConfig).toBeNull();
    expect(setupResult.result).not.toBeNull();
    expect(setupResult.result?.source).toBe('auto-detected');
    expect(setupResult.result?.inferred).toMatchObject({
      source: 'layout',
      config: {
        frontend: { framework: 'nextjs', routePrefix: '/' },
        api: {
          framework: 'fastapi',
          entrypoint: 'services/api',
          routePrefix: '/_/api',
        },
      },
    });
  });

  it('should report builds as a blocker for inferred services setup', async () => {
    delete process.env.VERCEL_USE_EXPERIMENTAL_SERVICES;
    await mkdir(join(tempDir, 'services/api'), { recursive: true });
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ dependencies: { next: '14.0.0' } })
    );
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({
        builds: [{ src: 'package.json', use: '@vercel/next' }],
      })
    );
    await writeFile(
      join(tempDir, 'services/api/requirements.txt'),
      'fastapi\n'
    );
    await writeFile(
      join(tempDir, 'services/api/index.py'),
      'from fastapi import FastAPI\napp = FastAPI()\n'
    );

    const setupResult = await detectServicesForSetup(tempDir);

    expect(setupResult.result).toBeNull();
    expect(setupResult.blockedByProjectConfig).toBe('builds');
  });

  it('should write inferred services config into vercel.json', async () => {
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({ buildCommand: 'npm run build' })
    );

    await writeServicesConfig(tempDir, {
      frontend: { framework: 'nextjs', routePrefix: '/' },
      api: {
        framework: 'fastapi',
        entrypoint: 'services/api',
        routePrefix: '/_/api',
      },
    });

    const vercelConfig = JSON.parse(
      await readFile(join(tempDir, 'vercel.json'), 'utf8')
    );
    expect(vercelConfig).toEqual({
      buildCommand: 'npm run build',
      experimentalServices: {
        frontend: { framework: 'nextjs', routePrefix: '/' },
        api: {
          framework: 'fastapi',
          entrypoint: 'services/api',
          routePrefix: '/_/api',
        },
      },
    });
  });

  describe('without VERCEL_USE_EXPERIMENTAL_SERVICES env var', () => {
    beforeEach(() => {
      delete process.env.VERCEL_USE_EXPERIMENTAL_SERVICES;
    });

    it('should return services when vercel.json has experimentalServices', async () => {
      await mkdir(join(tempDir, 'api'), { recursive: true });
      await writeFile(
        join(tempDir, 'vercel.json'),
        JSON.stringify({
          experimentalServices: {
            frontend: { framework: 'nextjs', routePrefix: '/' },
            backend: { entrypoint: 'api/index.py', routePrefix: '/api' },
          },
        })
      );
      await writeFile(
        join(tempDir, 'api/index.py'),
        'def app():\n  return None\n'
      );

      const result = await tryDetectServices(tempDir);
      expect(result).not.toBeNull();
      expect(result?.services).toHaveLength(2);
    });

    it('should return null when vercel.json has no experimentalServices', async () => {
      await writeFile(
        join(tempDir, 'vercel.json'),
        JSON.stringify({ buildCommand: 'npm run build' })
      );

      const result = await tryDetectServices(tempDir);
      expect(result).toBeNull();
    });

    it('should return null when no vercel.json exists', async () => {
      const result = await tryDetectServices(tempDir);
      expect(result).toBeNull();
    });
  });

  describe('isExperimentalServicesEnabled()', () => {
    beforeEach(() => {
      delete process.env.VERCEL_USE_EXPERIMENTAL_SERVICES;
    });

    it('should return true when vercel.json has experimentalServices', async () => {
      await writeFile(
        join(tempDir, 'vercel.json'),
        JSON.stringify({
          experimentalServices: {
            frontend: { framework: 'nextjs', routePrefix: '/' },
          },
        })
      );

      await expect(isExperimentalServicesEnabled(tempDir)).resolves.toBe(true);
    });

    it('should return true when env var is set', async () => {
      process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '1';
      await expect(isExperimentalServicesEnabled(tempDir)).resolves.toBe(true);
    });

    it('should return false when vercel.json has no experimentalServices', async () => {
      await writeFile(
        join(tempDir, 'vercel.json'),
        JSON.stringify({ buildCommand: 'npm run build' })
      );

      await expect(isExperimentalServicesEnabled(tempDir)).resolves.toBe(false);
    });

    it('should return false when no vercel.json exists', async () => {
      await expect(isExperimentalServicesEnabled(tempDir)).resolves.toBe(false);
    });
  });
});
