import { FileFsRef, Files } from '@vercel/build-utils/dist';
import { build } from '../../src/build';
import { build as experimentalBuild } from '../../src/experimental/build';
import { join, sep } from 'path';
import { describe, expect, it } from 'vitest';
import fs from 'fs';

const config = {
  outputDirectory: undefined,
  zeroConfig: true,
  framework: 'express',
  projectSettings: {
    createdAt: 1752690985471,
    framework: 'express',
    devCommand: null,
    installCommand: null,
    buildCommand: null,
    outputDirectory: null,
    rootDirectory: null,
    directoryListing: false,
    nodeVersion: '22.x',
  },
  installCommand: undefined,
  devCommand: undefined,
  buildCommand: undefined,
  nodeVersion: '22.x',
};
const meta = { skipDownload: true };

const createFiles = (workPath: string, fileList: string[]) => {
  const files: Files = {};

  for (const path of fileList) {
    if (!path) {
      console.log('❌ createFiles - Found undefined/null path!');
      continue;
    }

    const fullPath = join(workPath, path);

    files[path] = new FileFsRef({
      fsPath: fullPath,
      mode: 0o644,
    });
  }
  return files;
};

const readDirectoryRecursively = (dirPath: string, basePath = ''): string[] => {
  const files: string[] = [];
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const fullPath = join(dirPath, item);
    const relativePath = basePath ? join(basePath, item) : item;

    if (fs.statSync(fullPath).isDirectory()) {
      files.push(...readDirectoryRecursively(fullPath, relativePath));
    } else {
      files.push(relativePath);
    }
  }

  return files;
};

const fixtures: Record<
  string,
  {
    handler: string[];
    moduleType: 'cjs' | 'esm';
    projectSettings?: {
      outputDirectory?: string;
    };
    routes?: { dest: string }[];
  }
> = {
  '01-index-js-no-module': {
    handler: ['index.js'],
    moduleType: 'cjs',
    routes: [
      {
        dest: '/',
      },
      {
        dest: '/user/:id',
      },
      {
        dest: '/user/:id/posts',
      },
      {
        dest: '/blog/*slugs',
      },
    ],
  },
  '02-src-index-js-no-module': {
    handler: ['src', 'index.js'],
    moduleType: 'cjs',
  },
  '03-server-js-no-module': {
    handler: ['server.js'],
    moduleType: 'cjs',
  },
  '04-index-mjs-no-module': {
    handler: ['index.mjs'],
    moduleType: 'esm',
  },
  '05-index-mjs-no-module': {
    handler: ['index.mjs'],
    moduleType: 'esm',
  },
  '06-server-mjs-no-module': {
    handler: ['server.mjs'],
    moduleType: 'esm',
  },
  '07-index-ts-no-module-no-tsconfig': {
    handler: ['index.js'],
    moduleType: 'cjs',
  },
  '08-src-index-ts-no-module-no-tsconfig': {
    handler: ['src', 'index.js'],
    moduleType: 'cjs',
  },
  '09-server-ts-no-module-no-tsconfig': {
    handler: ['server.js'],
    moduleType: 'cjs',
  },
  '10-index-ts-no-tsconfig': {
    handler: ['index.js'],
    moduleType: 'esm',
  },
  '11-index-ts-tsconfig-node': {
    handler: ['index.js'],
    moduleType: 'esm',
  },
  '12-index-mts-tsconfig-node-no-module': {
    handler: ['index.mjs'],
    moduleType: 'esm',
  },
  '13-index-ts-output-directory': {
    handler: ['dist', 'index.js'],
    moduleType: 'esm',
    projectSettings: {
      outputDirectory: 'dist',
    },
  },
  '14-app-js-no-module': {
    handler: ['app.js'],
    moduleType: 'cjs',
  },
  '15-src-server-js-no-module': {
    handler: ['src', 'server.js'],
    moduleType: 'cjs',
  },
  '16-src-app-js-no-module': {
    handler: ['src', 'app.js'],
    moduleType: 'cjs',
  },
  '17-multiple-matches': {
    // matches alphabetically first
    handler: ['src', 'app.js'],
    moduleType: 'cjs',
  },
  '18-multiple-matches-with-no-exp': {
    // src/app.js is alphabetically first, but its contents don't match the regex
    handler: ['src', 'index.js'],
    moduleType: 'cjs',
  },
  '19-index-cts-module-tsconfig': {
    handler: ['index.cjs'],
    moduleType: 'cjs',
  },
  '20-main-field': {
    handler: ['main.js'],
    moduleType: 'esm',
  },
  '21-main-field-with-build-step': {
    handler: ['dist', 'main.js'],
    moduleType: 'esm',
  },
};

const failingFixtures: Record<
  string,
  {
    projectSettings?: {
      outputDirectory?: string;
    };
  }
> = {
  '01-server-ts-no-module-no-tsconfig': {},
  '02-missing-entrypoint': {},
  '03-missing-entrypoint-with-build-and-main': {},
  '04-missing-entrypoint-with-build-and-output-dir': {
    projectSettings: {
      outputDirectory: 'dist',
    },
  },
  '05-missing-entrypoint-with-main': {},
  '06-missing-entrypoint-with-output-dir': {
    projectSettings: {
      outputDirectory: 'dist',
    },
  },
};

describe('successful builds', () => {
  for (const [fixtureName, fixtureConfig] of Object.entries(fixtures)) {
    it(`builds ${fixtureName}`, async () => {
      const workPath = join(__dirname, '../fixtures', fixtureName);

      const fileList = readDirectoryRecursively(workPath);

      const files = createFiles(workPath, fileList);
      const result = await build({
        files,
        workPath,
        config: {
          ...config,
          projectSettings: {
            ...config.projectSettings,
            ...fixtureConfig.projectSettings,
          },
        },
        meta,
        // Entrypoint is just used as the BOA function name
        entrypoint: 'package.json',
        repoRootPath: workPath,
      });

      if ('handler' in result.output) {
        expect(result.output.handler).toBe(fixtureConfig.handler.join(sep));
        const file = result.output.files?.[result.output.handler];
        if (file && 'data' in file) {
          const content = file.data.toString();
          const moduleTypeDetected = await detectModuleType(content);
          expect(moduleTypeDetected).toBe(fixtureConfig.moduleType);
        } else {
          throw new Error(`file not found: ${result.output.handler}`);
        }
      } else {
        throw new Error('entrypoint is not defined');
      }
    }, 10000);
  }
  for (const [fixtureName, fixtureConfig] of Object.entries(fixtures)) {
    it(`experimental builds ${fixtureName}`, async () => {
      const workPath = join(__dirname, '../fixtures', fixtureName);

      const fileList = readDirectoryRecursively(workPath);

      const files = createFiles(workPath, fileList);
      const result = await experimentalBuild({
        files,
        workPath,
        config: {
          ...config,
          projectSettings: {
            ...config.projectSettings,
            ...fixtureConfig.projectSettings,
          },
        },
        meta,
        // Entrypoint is just used as the BOA function name
        entrypoint: 'package.json',
        repoRootPath: workPath,
      });
      for (const route of fixtureConfig.routes || []) {
        if ('routes' in result && result.routes) {
          expect(result.routes.find(r => r.dest === route.dest)).toBeDefined();
        }
        if ('output' in result && result.output) {
          const dest = route.dest === '/' ? 'index' : route.dest;
          expect(result.output[dest]).toBeDefined();
        }
      }

      if ('output' in result && result.output) {
        // console.log(result.output.index);
        if ('handler' in result.output.index) {
          const entrypoint = join(
            workPath,
            '.vercel',
            'output',
            'functions',
            'index.func',
            result.output.index.handler
          );
          const handlerContent = fs.readFileSync(entrypoint, 'utf8');
          const moduleTypeDetected = await detectModuleType(handlerContent);
          expect(moduleTypeDetected).toBe(fixtureConfig.moduleType);
        }
      } else {
        throw new Error('entrypoint is not defined');
      }
    }, 10000);
  }
  describe('failing fixtures', () => {
    for (const [fixtureName, fixtureConfig] of Object.entries(
      failingFixtures
    )) {
      it(`should fail to build${fixtureName}`, async () => {
        const workPath = join(__dirname, '../failing-fixtures', fixtureName);

        const fileList = readDirectoryRecursively(workPath);

        const files = createFiles(workPath, fileList);

        expect(
          build({
            files,
            workPath,
            config: {
              ...config,
              projectSettings: {
                ...config.projectSettings,
                ...fixtureConfig.projectSettings,
              },
            },
            meta,
            // Entrypoint is just used as the BOA function name
            entrypoint: 'this value is not used',
            repoRootPath: workPath,
          })
        ).rejects.toThrowError();
      });
    }
  });
});

function detectModuleType(code) {
  // Quick heuristics:
  const hasImportExport =
    /\bimport\s+[\w*\s{},]+from\s+['"][^'"]+['"]/.test(code) ||
    /\bimport\s*['"][^'"]+['"]/.test(code) || // side-effect imports
    /\bexport\s+(default|const|function|class|\{)/.test(code);

  if (hasImportExport) {
    return 'esm';
  }

  const hasCjs =
    /\brequire\s*\(/.test(code) ||
    /\bmodule\.exports\b/.test(code) ||
    /\bexports\./.test(code);

  if (hasCjs) {
    return 'cjs';
  }

  return 'unknown';
}
