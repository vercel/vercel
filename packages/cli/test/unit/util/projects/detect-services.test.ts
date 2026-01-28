import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import {
  detectProjectServices,
  isExperimentalServicesEnabled,
} from '../../../../src/util/projects/detect-services';

describe('isExperimentalServicesEnabled()', () => {
  const originalEnv = process.env.VERCEL_USE_EXPERIMENTAL_SERVICES;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.VERCEL_USE_EXPERIMENTAL_SERVICES;
    } else {
      process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = originalEnv;
    }
  });

  it('should return false when env var is not set', () => {
    delete process.env.VERCEL_USE_EXPERIMENTAL_SERVICES;
    expect(isExperimentalServicesEnabled()).toBe(false);
  });

  it('should return false when env var is set to 0', () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '0';
    expect(isExperimentalServicesEnabled()).toBe(false);
  });

  it('should return false when env var is set to empty string', () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '';
    expect(isExperimentalServicesEnabled()).toBe(false);
  });

  it('should return true when env var is set to 1', () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '1';
    expect(isExperimentalServicesEnabled()).toBe(true);
  });

  it('should return true when env var is set to true', () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = 'true';
    expect(isExperimentalServicesEnabled()).toBe(true);
  });

  it('should return true when env var is set to TRUE (case insensitive)', () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = 'TRUE';
    expect(isExperimentalServicesEnabled()).toBe(true);
  });
});

describe('detectProjectServices()', () => {
  const originalEnv = process.env.VERCEL_USE_EXPERIMENTAL_SERVICES;
  let tempDir: string;

  beforeEach(async () => {
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

  it('should return null when env var is not set', async () => {
    delete process.env.VERCEL_USE_EXPERIMENTAL_SERVICES;
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({
        experimentalServices: {
          api: {
            entrypoint: 'index.ts',
            routePrefix: '/',
          },
        },
      })
    );

    const result = await detectProjectServices(tempDir);
    expect(result).toBeNull();
  });

  it('should return null when no vercel.json exists', async () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '1';

    const result = await detectProjectServices(tempDir);
    expect(result).toBeNull();
  });

  it('should return null when vercel.json has no experimentalServices', async () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '1';
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({
        buildCommand: 'npm run build',
      })
    );

    const result = await detectProjectServices(tempDir);
    expect(result).toBeNull();
  });

  it('should detect services when env var is set and experimentalServices exists', async () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '1';
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({
        experimentalServices: {
          frontend: {
            framework: 'nextjs',
            routePrefix: '/',
          },
          backend: {
            entrypoint: 'api/index.py',
            routePrefix: '/api',
          },
        },
      })
    );

    const result = await detectProjectServices(tempDir);
    expect(result).not.toBeNull();
    expect(result?.services).toHaveLength(2);

    const frontend = result?.services.find(s => s.name === 'frontend');
    expect(frontend).toMatchObject({
      name: 'frontend',
      type: 'web',
      framework: 'nextjs',
      routePrefix: '/',
    });

    const backend = result?.services.find(s => s.name === 'backend');
    expect(backend).toMatchObject({
      name: 'backend',
      type: 'web',
      entrypoint: 'api/index.py',
      routePrefix: '/api',
    });
  });

  it('should detect services with different runtimes', async () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '1';
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({
        experimentalServices: {
          'node-api': {
            entrypoint: 'src/index.ts',
            routePrefix: '/node',
          },
          'python-api': {
            entrypoint: 'src/main.py',
            routePrefix: '/python',
          },
          'go-api': {
            entrypoint: 'main.go',
            routePrefix: '/go',
          },
          'ruby-api': {
            entrypoint: 'app.rb',
            routePrefix: '/ruby',
          },
        },
      })
    );

    const result = await detectProjectServices(tempDir);
    expect(result).not.toBeNull();
    expect(result?.services).toHaveLength(4);

    // Check that builders are correctly assigned based on entrypoint extension
    const nodeApi = result?.services.find(s => s.name === 'node-api');
    expect(nodeApi?.builder.use).toBe('@vercel/node');

    const pythonApi = result?.services.find(s => s.name === 'python-api');
    expect(pythonApi?.builder.use).toBe('@vercel/python');

    const goApi = result?.services.find(s => s.name === 'go-api');
    expect(goApi?.builder.use).toBe('@vercel/go');

    const rubyApi = result?.services.find(s => s.name === 'ruby-api');
    expect(rubyApi?.builder.use).toBe('@vercel/ruby');
  });

  it('should detect worker and cron services', async () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '1';
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({
        experimentalServices: {
          'my-worker': {
            type: 'worker',
            entrypoint: 'worker.py',
            topic: 'tasks',
          },
          'my-cron': {
            type: 'cron',
            entrypoint: 'cron.ts',
            schedule: '0 * * * *',
          },
        },
      })
    );

    const result = await detectProjectServices(tempDir);
    expect(result).not.toBeNull();
    expect(result?.services).toHaveLength(2);

    const worker = result?.services.find(s => s.name === 'my-worker');
    expect(worker?.type).toBe('worker');
    expect(worker?.topic).toBe('tasks');

    const cron = result?.services.find(s => s.name === 'my-cron');
    expect(cron?.type).toBe('cron');
    expect(cron?.schedule).toBe('0 * * * *');
  });

  it('should return result with errors for invalid service config', async () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '1';
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({
        experimentalServices: {
          // Missing routePrefix for web service
          'invalid-service': {
            entrypoint: 'index.ts',
          },
        },
      })
    );

    const result = await detectProjectServices(tempDir);
    expect(result).not.toBeNull();
    expect(result?.errors.length).toBeGreaterThan(0);
    expect(result?.errors[0].code).toBe('MISSING_ROUTE_PREFIX');
  });
});
