import { FileFsRef, Files } from '@vercel/build-utils/dist';
import { build } from '../../src/build';
import { join, sep } from 'path';
import { describe, expect, it } from 'vitest';
import fs from 'fs';

const config = {
  outputDirectory: undefined,
  zeroConfig: true,
  framework: 'h3',
  projectSettings: {
    createdAt: 1752690985471,
    framework: 'h3',
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
  '01-basic': {
    handler: ['server.mjs'],
    moduleType: 'esm',
  },
};

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

async function detectModuleType(content: string): Promise<'cjs' | 'esm'> {
  if (content.startsWith(`"use strict"`)) {
    return 'cjs';
  }

  return 'esm';
}
