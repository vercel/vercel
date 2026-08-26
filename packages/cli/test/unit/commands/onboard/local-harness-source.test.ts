import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirpSync, outputJSONSync, writeFileSync } from 'fs-extra';
import { join } from 'node:path';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import {
  getLocalHarnessSource,
  HARNESS_SOURCE_ENV_VAR,
  packLocalHarnessPackages,
} from '../../../../src/commands/onboard/local-harness-source';
import output from '../../../../src/output-manager';

/** Lay out a package the way the `ai` monorepo does. */
function writePackage(
  root: string,
  dir: string,
  manifest: { name: string; version?: string },
  options: { built?: boolean } = {}
): void {
  const packageDir = join(root, 'packages', dir);
  outputJSONSync(join(packageDir, 'package.json'), {
    version: '1.0.0',
    ...manifest,
  });

  if (options.built ?? true) {
    mkdirpSync(join(packageDir, 'dist'));
    writeFileSync(join(packageDir, 'dist', 'index.js'), 'export {};\n');
  }
}

describe('onboard local harness source', () => {
  const original = process.env[HARNESS_SOURCE_ENV_VAR];

  afterEach(() => {
    if (original === undefined) {
      delete process.env[HARNESS_SOURCE_ENV_VAR];
    } else {
      process.env[HARNESS_SOURCE_ENV_VAR] = original;
    }
    vi.restoreAllMocks();
  });

  describe('getLocalHarnessSource', () => {
    it('is not configured when the variable is unset', () => {
      delete process.env[HARNESS_SOURCE_ENV_VAR];
      expect(getLocalHarnessSource('/tmp/project')).toBeUndefined();
    });

    it('ignores a variable that is only whitespace', () => {
      process.env[HARNESS_SOURCE_ENV_VAR] = '   ';
      expect(getLocalHarnessSource('/tmp/project')).toBeUndefined();
    });

    it('keeps an absolute path as given', () => {
      process.env[HARNESS_SOURCE_ENV_VAR] = '/checkouts/ai';
      expect(getLocalHarnessSource('/tmp/project')).toEqual({
        root: '/checkouts/ai',
      });
    });

    it('resolves a relative path against the working directory', () => {
      process.env[HARNESS_SOURCE_ENV_VAR] = '../ai';
      expect(getLocalHarnessSource('/checkouts/vercel')).toEqual({
        root: '/checkouts/ai',
      });
    });
  });

  describe('packLocalHarnessPackages', () => {
    let root: string;
    let destination: string;
    let errors: string[];

    beforeEach(() => {
      const tmp = setupTmpDir();
      root = join(tmp, 'ai');
      destination = join(tmp, 'tarballs');
      errors = [];
      vi.spyOn(output, 'error').mockImplementation(message => {
        errors.push(String(message));
      });
    });

    it('reports a checkout that does not have the package', async () => {
      writePackage(root, 'harness', { name: '@ai-sdk/harness' });

      const packed = await packLocalHarnessPackages({
        source: { root },
        packages: ['@ai-sdk/harness', '@ai-sdk/harness-claude-code'],
        destination,
      });

      expect(packed).toBeUndefined();
      expect(errors.join('\n')).toContain(
        'no @ai-sdk/harness-claude-code package'
      );
    });

    it('reports a directory that holds a different package', async () => {
      writePackage(root, 'harness', { name: '@ai-sdk/something-else' });

      const packed = await packLocalHarnessPackages({
        source: { root },
        packages: ['@ai-sdk/harness'],
        destination,
      });

      expect(packed).toBeUndefined();
      expect(errors.join('\n')).toContain('@ai-sdk/something-else');
    });

    it('reports a package that has not been built', async () => {
      writePackage(
        root,
        'harness',
        { name: '@ai-sdk/harness' },
        {
          built: false,
        }
      );

      const packed = await packLocalHarnessPackages({
        source: { root },
        packages: ['@ai-sdk/harness'],
        destination,
      });

      expect(packed).toBeUndefined();
      expect(errors.join('\n')).toContain(
        'pnpm --filter @ai-sdk/harness build'
      );
    });

    it('fails before packing anything when one package is unusable', async () => {
      writePackage(root, 'harness', { name: '@ai-sdk/harness' });
      writePackage(
        root,
        'harness-claude-code',
        { name: '@ai-sdk/harness-claude-code' },
        { built: false }
      );

      const packed = await packLocalHarnessPackages({
        source: { root },
        packages: ['@ai-sdk/harness', '@ai-sdk/harness-claude-code'],
        destination,
      });

      // Nothing was packed, so a half-built checkout cannot leave a stale
      // tarball behind for the next run to install.
      expect(packed).toBeUndefined();
      expect(errors).toHaveLength(1);
    });
  });
});
