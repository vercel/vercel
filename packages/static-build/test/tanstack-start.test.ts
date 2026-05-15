import os from 'os';
import path from 'path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';

const mocks = vi.hoisted(() => ({
  runNpmInstall: vi.fn(async () => true),
}));

vi.mock('@vercel/build-utils', () => ({
  runNpmInstall: mocks.runNpmInstall,
}));

import { prepareTanStackStartBuildCommand } from '../src/utils/tanstack-start';

async function createFixture(files: Record<string, string>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tanstack-start-'));

  for (const [file, contents] of Object.entries(files)) {
    const filePath = path.join(dir, file);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }

  return dir;
}

describe('prepareTanStackStartBuildCommand()', () => {
  beforeEach(() => {
    mocks.runNpmInstall.mockClear();
  });

  test('generates a wrapper Vite config and leaves user files unchanged', async () => {
    const packageJson = JSON.stringify({
      dependencies: {
        '@tanstack/react-start': 'latest',
      },
    });
    const viteConfig = [
      "import { defineConfig } from 'vite';",
      "import { tanstackStart } from '@tanstack/react-start/plugin/vite';",
      "import viteReact from '@vitejs/plugin-react';",
      '',
      'export default defineConfig({',
      '  plugins: [tanstackStart(), viteReact()],',
      '});',
      '',
    ].join('\n');
    const dir = await createFixture({
      'package.json': packageJson,
      'vite.config.ts': viteConfig,
    });

    try {
      const buildCommand = await prepareTanStackStartBuildCommand({
        buildCommand: null,
        dir,
        meta: {},
      });

      expect(buildCommand).toBe(
        "vite build --config '.vercel/tanstack-start/vite.config.mjs'"
      );
      expect(await readFile(path.join(dir, 'package.json'), 'utf8')).toBe(
        packageJson
      );
      expect(await readFile(path.join(dir, 'vite.config.ts'), 'utf8')).toBe(
        viteConfig
      );

      const wrapperConfig = await readFile(
        path.join(dir, '.vercel/tanstack-start/vite.config.mjs'),
        'utf8'
      );
      expect(wrapperConfig).toContain("import { nitro } from 'nitro/vite';");
      expect(wrapperConfig).toContain(
        "import userConfig from '../../vite.config.ts';"
      );
      expect(wrapperConfig).toContain('plugins: [nitro()]');

      const helperPackageJson = await readFile(
        path.join(dir, '.vercel/tanstack-start/package.json'),
        'utf8'
      );
      expect(JSON.parse(helperPackageJson).dependencies.nitro).toBe('latest');
      expect(mocks.runNpmInstall).toHaveBeenCalledWith(
        path.join(dir, '.vercel/tanstack-start'),
        [],
        { env: process.env },
        {}
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('preserves an explicit Vite build command', async () => {
    const dir = await createFixture({
      'package.json': JSON.stringify({}),
      'vite.config.ts': 'export default { plugins: [] };\n',
      'node_modules/nitro/vite/index.js': 'export function nitro() {}\n',
    });

    try {
      const buildCommand = await prepareTanStackStartBuildCommand({
        buildCommand: 'vite build --mode production',
        dir,
        meta: {},
      });

      expect(buildCommand).toBe(
        "vite build --mode production --config '.vercel/tanstack-start/vite.config.mjs'"
      );
      expect(mocks.runNpmInstall).not.toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('preserves a simple package build script', async () => {
    const dir = await createFixture({
      'package.json': JSON.stringify({}),
      'vite.config.ts': 'export default { plugins: [] };\n',
      'node_modules/nitro/vite/index.js': 'export function nitro() {}\n',
    });

    try {
      const buildCommand = await prepareTanStackStartBuildCommand({
        buildCommand: null,
        dir,
        meta: {},
        packageBuildScript: 'vite build --mode production',
      });

      expect(buildCommand).toBe(
        "vite build --mode production --config '.vercel/tanstack-start/vite.config.mjs'"
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('does not generate a wrapper when the user config already uses nitro', async () => {
    const dir = await createFixture({
      'package.json': JSON.stringify({
        dependencies: {
          nitro: '3.0.1-alpha.0',
        },
      }),
      'vite.config.ts': [
        "import { defineConfig } from 'vite';",
        "import { nitro } from 'nitro/vite';",
        '',
        'export default defineConfig({',
        '  plugins: [nitro()],',
        '});',
        '',
      ].join('\n'),
    });

    try {
      const buildCommand = await prepareTanStackStartBuildCommand({
        buildCommand: null,
        dir,
        meta: {},
      });

      expect(buildCommand).toBeNull();
      await expect(
        readFile(path.join(dir, '.vercel/tanstack-start/vite.config.mjs'))
      ).rejects.toMatchObject({ code: 'ENOENT' });
      expect(mocks.runNpmInstall).not.toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
