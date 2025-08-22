import { FileFsRef, Files } from '@vercel/build-utils/dist';
import { build } from '../../src/build';
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

const fixtures = {
  '01-index-js-no-module': {
    handler: ['index.js'],
    moduleType: 'cjs',
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
    moduleType: 'cjs',
  },
  '11-index-ts-tsconfig-node': {
    handler: ['index.js'],
    moduleType: 'esm',
  },
  '12-index-mts-tsconfig-node-no-module': {
    handler: ['index.mjs'],
    moduleType: 'esm',
  },
  '13-app-js-no-module': {
    handler: ['app.js'],
    moduleType: 'cjs',
  },
};

const failingFixtures = ['01-server-ts-no-module-no-tsconfig'];

describe('build', () => {
  for (const [fixtureName, fixtureConfig] of Object.entries(fixtures)) {
    it(`should build ${fixtureName}`, async () => {
      const workPath = join(__dirname, '../fixtures', fixtureName);

      const fileList = readDirectoryRecursively(workPath);

      const files = createFiles(workPath, fileList);
      const result = await build({
        files,
        workPath,
        config,
        meta,
        // Entrypoint is just used as the BOA function name
        entrypoint: 'this value is not used',
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
    });
  }
});
describe('failing fixtures', () => {
  for (const fixtureName of failingFixtures) {
    it(`should fail to build${fixtureName}`, async () => {
      const workPath = join(__dirname, '../failing-fixtures', fixtureName);

      const fileList = readDirectoryRecursively(workPath);

      const files = createFiles(workPath, fileList);

      expect(
        build({
          files,
          workPath,
          config,
          meta,
          // Entrypoint is just used as the BOA function name
          entrypoint: 'this value is not used',
          repoRootPath: workPath,
        })
      ).rejects.toThrowError();
    });
  }
});

async function detectModuleType(content: string): Promise<'cjs' | 'esm'> {
  if (content.startsWith(`"use strict"`)) {
    return 'cjs';
  }

  return 'esm';
}
