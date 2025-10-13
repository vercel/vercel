import { FileFsRef, Files } from '@vercel/build-utils/dist';
import { build } from '../src';
import { join, sep } from 'path';
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import { readdir } from 'fs/promises';

const baseArgs = {
  entrypoint: 'package.json',
  // workPath: '/Users/jeffsee/code/express',
  // repoRootPath: '/Users/jeffsee/code/express',
  config: {
    zeroConfig: true,
    framework: 'express-experimental',
    installCommand: undefined,
    devCommand: 'cervel',
    buildCommand: 'cervel build server.ts',
    outputDirectory: 'dist',
    nodeVersion: '22.x',
    projectSettings: {
      createdAt: 1755545582636,
      framework: 'express-experimental',
      installCommand: null,
      devCommand: 'cervel',
      buildCommand: 'cervel build server.ts',
      outputDirectory: 'dist',
      rootDirectory: null,
      directoryListing: false,
      nodeVersion: '22.x',
    },
  },
  meta: { skipDownload: true, cliVersion: '48.2.8' },
};

const config = {
  outputDirectory: undefined,
  zeroConfig: true,
  framework: 'express-experimental',
  projectSettings: {
    createdAt: 1752690985471,
    framework: 'express-experimental',
    devCommand: null,
    installCommand: null,
    buildCommand: null,
    outputDirectory: null,
    rootDirectory: null,
    directoryListing: false,
    nodeVersion: '22.x',
  },
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

describe('successful builds', async () => {
  const fixtures = await readdir(join(__dirname, 'fixtures'));
  for (const fixtureName of fixtures) {
    it(`builds ${fixtureName}`, async () => {
      const workPath = join(__dirname, 'fixtures', fixtureName);

      const fileList = readDirectoryRecursively(workPath);

      const files = createFiles(workPath, fileList);
      const result = await build({
        files,
        workPath,
        config,
        meta,
        // Entrypoint is just used as the BOA function name
        entrypoint: 'package.json',
        repoRootPath: workPath,
      });
      console.log(result.routes);
      expect(JSON.stringify(result.routes, null, 2)).toMatchFileSnapshot(
        join(workPath, 'routes.json')
      );
    }, 10000);
  }
});
