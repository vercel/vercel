import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  detectFirstDeploymentFramework,
  isFirstDeployment,
  warnIfConfiguredFrameworkMismatch,
} from '../../../../src/util/build/framework-detection';
import output from '../../../../src/output-manager';

describe('isFirstDeployment()', () => {
  const original = process.env.VERCEL_FIRST_DEPLOYMENT;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.VERCEL_FIRST_DEPLOYMENT;
    } else {
      process.env.VERCEL_FIRST_DEPLOYMENT = original;
    }
  });

  it('returns true when VERCEL_FIRST_DEPLOYMENT is "1"', () => {
    process.env.VERCEL_FIRST_DEPLOYMENT = '1';
    expect(isFirstDeployment()).toBe(true);
  });

  it('returns false when VERCEL_FIRST_DEPLOYMENT is unset', () => {
    delete process.env.VERCEL_FIRST_DEPLOYMENT;
    expect(isFirstDeployment()).toBe(false);
  });

  it('returns false when VERCEL_FIRST_DEPLOYMENT is not "1"', () => {
    process.env.VERCEL_FIRST_DEPLOYMENT = '0';
    expect(isFirstDeployment()).toBe(false);
  });
});

describe('detectFirstDeploymentFramework()', () => {
  const original = process.env.VERCEL_FIRST_DEPLOYMENT;
  const created: string[] = [];

  afterEach(async () => {
    if (original === undefined) {
      delete process.env.VERCEL_FIRST_DEPLOYMENT;
    } else {
      process.env.VERCEL_FIRST_DEPLOYMENT = original;
    }
    while (created.length) {
      const dir = created.pop();
      if (dir) {
        await fs.remove(dir);
      }
    }
  });

  async function makeProjectDir(pkg?: object): Promise<string> {
    const dir = await fs.mkdtemp(join(tmpdir(), 'framework-detection-'));
    created.push(dir);
    if (pkg) {
      await fs.writeJSON(join(dir, 'package.json'), pkg);
    }
    return dir;
  }

  it('returns null when not a first deployment', async () => {
    delete process.env.VERCEL_FIRST_DEPLOYMENT;
    const dir = await makeProjectDir({ dependencies: { next: '14.0.0' } });
    const projectSettings: { framework?: string | null } = { framework: null };

    const result = await detectFirstDeploymentFramework({
      workPath: dir,
      projectSettings,
    });

    expect(result).toBeNull();
    expect(projectSettings.framework).toBeNull();
  });

  it('returns null when a framework is already configured', async () => {
    process.env.VERCEL_FIRST_DEPLOYMENT = '1';
    const dir = await makeProjectDir({ dependencies: { next: '14.0.0' } });
    const projectSettings: { framework?: string | null } = {
      framework: 'vite',
    };

    const result = await detectFirstDeploymentFramework({
      workPath: dir,
      projectSettings,
    });

    expect(result).toBeNull();
    expect(projectSettings.framework).toBe('vite');
  });

  it('detects the framework and applies it to project settings', async () => {
    process.env.VERCEL_FIRST_DEPLOYMENT = '1';
    const dir = await makeProjectDir({ dependencies: { next: '14.0.0' } });
    const projectSettings: { framework?: string | null } = { framework: null };

    const result = await detectFirstDeploymentFramework({
      workPath: dir,
      projectSettings,
    });

    expect(result).toEqual({ slug: 'nextjs', version: '14.0.0' });
    expect(projectSettings.framework).toBe('nextjs');
  });

  it('returns null when nothing is detected', async () => {
    process.env.VERCEL_FIRST_DEPLOYMENT = '1';
    const dir = await makeProjectDir();
    const projectSettings: { framework?: string | null } = { framework: null };

    const result = await detectFirstDeploymentFramework({
      workPath: dir,
      projectSettings,
    });

    expect(result).toBeNull();
    expect(projectSettings.framework).toBeNull();
  });
});

describe('warnIfConfiguredFrameworkMismatch()', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(output, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('does not warn when no framework is configured', () => {
    warnIfConfiguredFrameworkMismatch({
      configuredFramework: null,
      detectedFrameworks: ['nextjs'],
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when nothing was detected', () => {
    warnIfConfiguredFrameworkMismatch({
      configuredFramework: 'nextjs',
      detectedFrameworks: [],
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when the configured framework was detected', () => {
    warnIfConfiguredFrameworkMismatch({
      configuredFramework: 'nextjs',
      detectedFrameworks: ['nextjs', 'vite'],
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when the configured framework does not match', () => {
    warnIfConfiguredFrameworkMismatch({
      configuredFramework: 'nextjs',
      detectedFrameworks: ['vite'],
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0];
    expect(message).toContain('nextjs');
    expect(message).toContain('vite');
  });
});
