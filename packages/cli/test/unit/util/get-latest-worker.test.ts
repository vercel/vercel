import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const workerPath = join(
  __dirname,
  '../../../src/util/get-latest-version/get-latest-worker.cjs'
);

const { parseNpmrc, resolveRegistry, normalizeRegistry, loadNpmConfig } =
  require(workerPath);

describe('get-latest-worker helpers', () => {
  describe('parseNpmrc', () => {
    it('parses key=value pairs', () => {
      expect(parseNpmrc('registry=https://example.com/')).toEqual({
        registry: 'https://example.com/',
      });
    });

    it('ignores blank lines, comments, and section headers', () => {
      const content = [
        '',
        '# a hash comment',
        '; a semicolon comment',
        '[some-section]',
        'registry=https://example.com/',
        '',
      ].join('\n');
      expect(parseNpmrc(content)).toEqual({
        registry: 'https://example.com/',
      });
    });

    it('strips surrounding quotes from values', () => {
      const content = 'registry="https://example.com/"';
      expect(parseNpmrc(content)).toEqual({
        registry: 'https://example.com/',
      });
    });

    it('returns an empty object for an empty file', () => {
      expect(parseNpmrc('')).toEqual({});
    });
  });

  describe('normalizeRegistry', () => {
    it('appends a trailing slash if missing', () => {
      expect(normalizeRegistry('https://example.com')).toBe(
        'https://example.com/'
      );
    });

    it('keeps an existing trailing slash', () => {
      expect(normalizeRegistry('https://example.com/')).toBe(
        'https://example.com/'
      );
    });

    it('preserves a path component', () => {
      expect(normalizeRegistry('https://example.com/repo/npm/')).toBe(
        'https://example.com/repo/npm/'
      );
    });

    it('accepts http:// urls', () => {
      expect(normalizeRegistry('http://example.com')).toBe(
        'http://example.com/'
      );
    });

    it('falls back to the npmjs.org default for invalid urls', () => {
      expect(normalizeRegistry('not-a-url')).toBe(
        'https://registry.npmjs.org/'
      );
      expect(normalizeRegistry('')).toBe('https://registry.npmjs.org/');
      expect(normalizeRegistry('ftp://example.com/')).toBe(
        'https://registry.npmjs.org/'
      );
    });
  });

  describe('resolveRegistry', () => {
    afterEach(() => {
      delete process.env.npm_config_registry;
      delete process.env.NPM_CONFIG_REGISTRY;
    });

    it('falls back to the npmjs.org default when nothing is configured', () => {
      expect(resolveRegistry({})).toBe('https://registry.npmjs.org/');
    });

    it('honors npm_config_registry from the environment', () => {
      process.env.npm_config_registry = 'https://npm.internal.example.com/';
      expect(resolveRegistry({})).toBe('https://npm.internal.example.com/');
    });

    it('uses the registry= entry from .npmrc when no env override is set', () => {
      expect(
        resolveRegistry({
          registry: 'https://npm.internal.example.com/',
        })
      ).toBe('https://npm.internal.example.com/');
    });

    it('environment registry beats .npmrc entries', () => {
      process.env.npm_config_registry = 'https://env.example.com/';
      expect(
        resolveRegistry({
          registry: 'https://npmrc.example.com/',
        })
      ).toBe('https://env.example.com/');
    });
  });

  describe('loadNpmConfig', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'vercel-get-latest-worker-'));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
      delete process.env.npm_config_userconfig;
      delete process.env.npm_config_globalconfig;
    });

    it('reads a .npmrc from the provided cwd', async () => {
      writeFileSync(
        join(tmpDir, '.npmrc'),
        'registry=https://internal.example.com/'
      );
      // Point user/global configs at empty so they don't leak from the host
      // machine and pollute the test.
      const emptyConfig = join(tmpDir, 'empty.npmrc');
      writeFileSync(emptyConfig, '');
      process.env.npm_config_userconfig = emptyConfig;
      process.env.npm_config_globalconfig = emptyConfig;

      const config = await loadNpmConfig(tmpDir);
      expect(config.registry).toBe('https://internal.example.com/');
    });

    it('walks parent directories looking for .npmrc files', async () => {
      const project = join(tmpDir, 'parent', 'child');
      mkdirSync(project, { recursive: true });
      writeFileSync(
        join(tmpDir, 'parent', '.npmrc'),
        'registry=https://parent.example.com/'
      );

      const emptyConfig = join(tmpDir, 'empty.npmrc');
      writeFileSync(emptyConfig, '');
      process.env.npm_config_userconfig = emptyConfig;
      process.env.npm_config_globalconfig = emptyConfig;

      const config = await loadNpmConfig(project);
      expect(config.registry).toBe('https://parent.example.com/');
    });

    it('lets project .npmrc override user .npmrc', async () => {
      const projectDir = join(tmpDir, 'project');
      mkdirSync(projectDir);
      writeFileSync(
        join(projectDir, '.npmrc'),
        'registry=https://project.example.com/'
      );

      const userConfig = join(tmpDir, 'user.npmrc');
      writeFileSync(userConfig, 'registry=https://user.example.com/');
      process.env.npm_config_userconfig = userConfig;

      const emptyConfig = join(tmpDir, 'empty.npmrc');
      writeFileSync(emptyConfig, '');
      process.env.npm_config_globalconfig = emptyConfig;

      const config = await loadNpmConfig(projectDir);
      expect(config.registry).toBe('https://project.example.com/');
    });

    it('falls back to user .npmrc when no project file is found', async () => {
      const projectDir = join(tmpDir, 'project');
      mkdirSync(projectDir);

      const userConfig = join(tmpDir, 'user.npmrc');
      writeFileSync(userConfig, 'registry=https://user.example.com/');
      process.env.npm_config_userconfig = userConfig;

      const emptyConfig = join(tmpDir, 'empty.npmrc');
      writeFileSync(emptyConfig, '');
      process.env.npm_config_globalconfig = emptyConfig;

      const config = await loadNpmConfig(projectDir);
      expect(config.registry).toBe('https://user.example.com/');
    });
  });
});
