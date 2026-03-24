import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { detectServices, LocalFileSystemDetector } from '@vercel/fs-detectors';
import {
  getBuildableServices,
  getServicesConfigWriteBlocker,
  hasExperimentalServicesConfig,
  writeServicesConfig,
} from '../../../../src/util/projects/detect-services';

describe('getBuildableServices()', () => {
  const originalEnv = process.env.VERCEL_USE_EXPERIMENTAL_INFERRED_SERVICES;
  let tempDir: string;

  beforeEach(async () => {
    delete process.env.VERCEL_USE_EXPERIMENTAL_INFERRED_SERVICES;
    tempDir = join(tmpdir(), `detect-services-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.VERCEL_USE_EXPERIMENTAL_INFERRED_SERVICES;
    } else {
      process.env.VERCEL_USE_EXPERIMENTAL_INFERRED_SERVICES = originalEnv;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should return an empty array when no vercel.json exists and no service found', async () => {
    const result = await getBuildableServices(tempDir);
    expect(result).toEqual([]);
  });

  it('should return an empty array for root-only project with no backend', async () => {
    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify({ dependencies: { next: '14.0.0' } })
    );

    const result = await getBuildableServices(tempDir);
    expect(result).toEqual([]);
  });

  it('should return an empty array when vercel.json has no experimentalServices and no service found', async () => {
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({ buildCommand: 'npm run build' })
    );

    const result = await getBuildableServices(tempDir);
    expect(result).toEqual([]);
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

    const services = await getBuildableServices(tempDir);
    expect(services).toHaveLength(2);
    expect(services.find(s => s.name === 'frontend')).toMatchObject({
      name: 'frontend',
      framework: 'nextjs',
      routePrefix: '/',
    });
    expect(services.find(s => s.name === 'backend')).toMatchObject({
      name: 'backend',
      entrypoint: 'api/index.py',
      routePrefix: '/api',
    });
  });

  it('should return an empty array for invalid services config', async () => {
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({
        experimentalServices: {
          // Missing routePrefix for web service
          'invalid-service': { entrypoint: 'index.ts' },
        },
      })
    );

    const result = await getBuildableServices(tempDir);
    expect(result).toEqual([]);
  });

  it('should return inferred runnable services when opted in', async () => {
    process.env.VERCEL_USE_EXPERIMENTAL_INFERRED_SERVICES = '1';
    await mkdir(join(tempDir, 'frontend'), { recursive: true });
    await mkdir(join(tempDir, 'services/api'), { recursive: true });
    await writeFile(
      join(tempDir, 'frontend/package.json'),
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

    const services = await getBuildableServices(tempDir);
    expect(services).toHaveLength(2);
    expect(services.map(service => service.name).sort()).toEqual([
      'api',
      'frontend',
    ]);
  });

  it('should report builds as a blocker for inferred services config writes', async () => {
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

    const result = await detectServices({
      fs: new LocalFileSystemDetector(tempDir),
    });

    expect(result.inferred?.source).toBe('layout');
    await expect(
      getServicesConfigWriteBlocker(tempDir, result.inferred!.config)
    ).resolves.toBe('builds');
  });

  it('should write inferred services config into vercel.json', async () => {
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({ buildCommand: 'npm run build' })
    );

    await writeServicesConfig(tempDir, {
      frontend: { framework: 'nextjs', routePrefix: '/' },
      api: {
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
          entrypoint: 'services/api',
          routePrefix: '/_/api',
        },
      },
    });
  });

  describe('hasExperimentalServicesConfig()', () => {
    beforeEach(() => {
      delete process.env.VERCEL_USE_EXPERIMENTAL_INFERRED_SERVICES;
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

      await expect(hasExperimentalServicesConfig(tempDir)).resolves.toBe(true);
    });

    it('should return false when services are only inferred from layout', async () => {
      await mkdir(join(tempDir, 'frontend'), { recursive: true });
      await mkdir(join(tempDir, 'services/api'), { recursive: true });
      await writeFile(
        join(tempDir, 'frontend/package.json'),
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

      await expect(hasExperimentalServicesConfig(tempDir)).resolves.toBe(false);
    });

    it('should return false when vercel.json has no experimentalServices', async () => {
      await writeFile(
        join(tempDir, 'vercel.json'),
        JSON.stringify({ buildCommand: 'npm run build' })
      );

      await expect(hasExperimentalServicesConfig(tempDir)).resolves.toBe(false);
    });

    it('should return false when no vercel.json exists', async () => {
      await expect(hasExperimentalServicesConfig(tempDir)).resolves.toBe(false);
    });
  });
});
