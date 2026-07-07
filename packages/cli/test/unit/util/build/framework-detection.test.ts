import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  detectFirstDeploymentFramework,
  isFirstDeployment,
  isFrameworkDetectionEnabled,
  warnIfFrameworkMismatch,
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

describe('isFrameworkDetectionEnabled()', () => {
  const original = process.env.VERCEL_FRAMEWORK_DETECTION;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.VERCEL_FRAMEWORK_DETECTION;
    } else {
      process.env.VERCEL_FRAMEWORK_DETECTION = original;
    }
  });

  it('returns true when VERCEL_FRAMEWORK_DETECTION is "1"', () => {
    process.env.VERCEL_FRAMEWORK_DETECTION = '1';
    expect(isFrameworkDetectionEnabled()).toBe(true);
  });

  it('returns false when VERCEL_FRAMEWORK_DETECTION is unset', () => {
    delete process.env.VERCEL_FRAMEWORK_DETECTION;
    expect(isFrameworkDetectionEnabled()).toBe(false);
  });

  it('returns false when VERCEL_FRAMEWORK_DETECTION is not "1"', () => {
    process.env.VERCEL_FRAMEWORK_DETECTION = '0';
    expect(isFrameworkDetectionEnabled()).toBe(false);
  });
});

describe('detectFirstDeploymentFramework()', () => {
  const original = process.env.VERCEL_FIRST_DEPLOYMENT;
  const originalEnabled = process.env.VERCEL_FRAMEWORK_DETECTION;
  const created: string[] = [];

  beforeEach(() => {
    // Framework detection is opt-in
    process.env.VERCEL_FRAMEWORK_DETECTION = '1';
  });

  afterEach(async () => {
    if (original === undefined) {
      delete process.env.VERCEL_FIRST_DEPLOYMENT;
    } else {
      process.env.VERCEL_FIRST_DEPLOYMENT = original;
    }
    if (originalEnabled === undefined) {
      delete process.env.VERCEL_FRAMEWORK_DETECTION;
    } else {
      process.env.VERCEL_FRAMEWORK_DETECTION = originalEnabled;
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

  it('returns skipped when not a first deployment', async () => {
    delete process.env.VERCEL_FIRST_DEPLOYMENT;
    const dir = await makeProjectDir({ dependencies: { next: '14.0.0' } });
    const projectSettings: { framework?: string | null } = { framework: null };

    const result = await detectFirstDeploymentFramework({
      workPath: dir,
      projectSettings,
    });

    expect(result).toEqual({ status: 'skipped' });
    expect(projectSettings.framework).toBeNull();
  });

  it('returns skipped when framework detection is not opted in', async () => {
    process.env.VERCEL_FIRST_DEPLOYMENT = '1';
    delete process.env.VERCEL_FRAMEWORK_DETECTION;
    const dir = await makeProjectDir({ dependencies: { next: '14.0.0' } });
    const projectSettings: { framework?: string | null } = {
      framework: null,
    };

    const result = await detectFirstDeploymentFramework({
      workPath: dir,
      projectSettings,
    });

    expect(result).toEqual({ status: 'skipped' });
    expect(projectSettings.framework).toBeNull();
  });

  it('returns skipped when a framework is already configured', async () => {
    process.env.VERCEL_FIRST_DEPLOYMENT = '1';
    const dir = await makeProjectDir({ dependencies: { next: '14.0.0' } });
    const projectSettings: { framework?: string | null } = {
      framework: 'vite',
    };

    const result = await detectFirstDeploymentFramework({
      workPath: dir,
      projectSettings,
    });

    expect(result).toEqual({ status: 'skipped' });
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

    expect(result).toEqual({
      status: 'detected',
      slug: 'nextjs',
      version: '14.0.0',
    });
    expect(projectSettings.framework).toBe('nextjs');
  });

  it('returns not-detected when nothing is detected', async () => {
    process.env.VERCEL_FIRST_DEPLOYMENT = '1';
    const dir = await makeProjectDir();
    const projectSettings: { framework?: string | null } = { framework: null };

    const result = await detectFirstDeploymentFramework({
      workPath: dir,
      projectSettings,
    });

    expect(result).toEqual({ status: 'not-detected' });
    expect(projectSettings.framework).toBeNull();
  });
});

describe('warnIfFrameworkMismatch()', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(output, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('does not warn when nothing was detected', () => {
    warnIfFrameworkMismatch({
      configuredFramework: 'nextjs',
      detectedFrameworks: [],
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when the configured framework was detected', () => {
    warnIfFrameworkMismatch({
      configuredFramework: 'nextjs',
      detectedFrameworks: ['nextjs', 'vite'],
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when the configured framework does not match', () => {
    warnIfFrameworkMismatch({
      configuredFramework: 'nextjs',
      detectedFrameworks: ['vite'],
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0];
    expect(message).toContain('nextjs');
    expect(message).toContain('vite');
  });

  it('does not warn when no framework is configured but the build used a framework-tagged build', () => {
    warnIfFrameworkMismatch({
      configuredFramework: null,
      detectedFrameworks: ['nextjs'],
      usedBuilders: ['@vercel/next'],
      usedFrameworks: ['nextjs'],
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does not warn when no framework is configured but the detected framework's runtime builder ran", () => {
    warnIfFrameworkMismatch({
      configuredFramework: null,
      detectedFrameworks: ['hono'],
      usedBuilders: ['@vercel/hono@latest'],
      usedFrameworks: [undefined],
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when no framework is configured and the build did not use any detected framework', () => {
    const result = warnIfFrameworkMismatch({
      configuredFramework: null,
      detectedFrameworks: ['hono'],
      usedBuilders: ['@vercel/static'],
      usedFrameworks: [undefined],
    });
    expect(result).toBe('unused-mismatch');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0];
    expect(message).toContain('hono');
    expect(message).toContain('no framework is configured');
  });

  it('does not warn for weak-signal detections like storybook on a static site', () => {
    const result = warnIfFrameworkMismatch({
      configuredFramework: null,
      detectedFrameworks: ['storybook'],
      usedBuilders: ['@vercel/static'],
      usedFrameworks: [undefined],
    });
    expect(result).toBe('low-confidence');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn for detections without a dedicated runtime builder like jekyll', () => {
    const result = warnIfFrameworkMismatch({
      configuredFramework: null,
      detectedFrameworks: ['jekyll'],
      usedBuilders: ['@vercel/static'],
      usedFrameworks: [undefined],
    });
    expect(result).toBe('low-confidence');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn when detected frameworks have no dedicated runtime builder (static-build frameworks)', () => {
    const result = warnIfFrameworkMismatch({
      configuredFramework: null,
      detectedFrameworks: ['astro'],
      usedBuilders: ['@vercel/static-build'],
      usedFrameworks: [undefined],
    });
    expect(result).toBe('low-confidence');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not warn on configured mismatch when all detections are weak-signal', () => {
    const result = warnIfFrameworkMismatch({
      configuredFramework: 'astro',
      detectedFrameworks: ['storybook'],
      usedBuilders: ['@vercel/static-build'],
      usedFrameworks: ['astro'],
    });
    expect(result).toBe('low-confidence');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('still warns on configured mismatch when a high-confidence framework was detected', () => {
    const result = warnIfFrameworkMismatch({
      configuredFramework: 'nextjs',
      detectedFrameworks: ['vite', 'storybook'],
      usedBuilders: [],
      usedFrameworks: [],
    });
    expect(result).toBe('configured-mismatch');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0];
    // Weak-signal `storybook` should not appear in the warning message
    expect(message).toContain('vite');
    expect(message).not.toContain('storybook');
  });
});
