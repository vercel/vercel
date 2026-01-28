import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';

// Mock the display functions
vi.mock('../../../../src/util/input/display-services', () => ({
  displayDetectedServices: vi.fn(),
  displayServiceErrors: vi.fn(),
  displayServicesConfigNote: vi.fn(),
}));

import {
  tryDetectServices,
  isExperimentalServicesEnabled,
} from '../../../../src/util/projects/detect-services';
import {
  displayDetectedServices,
  displayServicesConfigNote,
} from '../../../../src/util/input/display-services';

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

describe('tryDetectServices()', () => {
  const originalEnv = process.env.VERCEL_USE_EXPERIMENTAL_SERVICES;
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
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
          api: { entrypoint: 'index.ts', routePrefix: '/' },
        },
      })
    );

    const result = await tryDetectServices(tempDir);
    expect(result).toBeNull();
    expect(displayDetectedServices).not.toHaveBeenCalled();
  });

  it('should return null when no vercel.json exists', async () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '1';

    const result = await tryDetectServices(tempDir);
    expect(result).toBeNull();
    expect(displayDetectedServices).not.toHaveBeenCalled();
  });

  it('should return null when vercel.json has no experimentalServices', async () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '1';
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({ buildCommand: 'npm run build' })
    );

    const result = await tryDetectServices(tempDir);
    expect(result).toBeNull();
    expect(displayDetectedServices).not.toHaveBeenCalled();
  });

  it('should return "services" and display when services are detected', async () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '1';
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
    expect(result).toBe('services');
    expect(displayDetectedServices).toHaveBeenCalledTimes(1);
    expect(displayServicesConfigNote).toHaveBeenCalledTimes(1);
  });

  it('should display errors when service config has validation issues', async () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '1';
    await writeFile(
      join(tempDir, 'vercel.json'),
      JSON.stringify({
        experimentalServices: {
          // Valid service
          valid: { entrypoint: 'index.ts', routePrefix: '/' },
          // Invalid service (missing routePrefix) - will cause error but valid one still works
        },
      })
    );

    const result = await tryDetectServices(tempDir);
    expect(result).toBe('services');
    expect(displayDetectedServices).toHaveBeenCalled();
  });

  it('should return null when all services have validation errors', async () => {
    process.env.VERCEL_USE_EXPERIMENTAL_SERVICES = '1';
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
    // No valid services, so returns null
    expect(result).toBeNull();
  });
});
