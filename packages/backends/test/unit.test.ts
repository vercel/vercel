import {
  BuildResultV2Typical,
  FileFsRef,
  Files,
} from '@vercel/build-utils/dist';
import { build } from '../dist';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { readdir, readFile, rm, stat } from 'fs/promises';
import { existsSync } from 'fs';

const clearOutputs = async (fixtureName: string) => {
  await rm(join(__dirname, 'fixtures', fixtureName, '.vercel'), {
    recursive: true,
    force: true,
  });
  await rm(join(__dirname, 'fixtures', fixtureName, 'dist'), {
    recursive: true,
    force: true,
  });
  await rm(join(__dirname, 'fixtures', fixtureName, 'node_modules'), {
    recursive: true,
    force: true,
  });
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

const readDirectoryRecursively = async (
  dirPath: string,
  basePath = ''
): Promise<string[]> => {
  const files: string[] = [];
  const items = await readdir(dirPath);

  for (const item of items) {
    const fullPath = join(dirPath, item);
    const relativePath = basePath ? join(basePath, item) : item;

    if ((await stat(fullPath)).isDirectory()) {
      files.push(...(await readDirectoryRecursively(fullPath, relativePath)));
    } else {
      files.push(relativePath);
    }
  }

  return files;
};

describe('successful builds', async () => {
  const fixtures = (await readdir(join(__dirname, 'fixtures'))).filter(
    fixtureName => fixtureName.includes('01')
  );
  for (const fixtureName of fixtures) {
    it(`builds ${fixtureName}`, async () => {
      await clearOutputs(fixtureName);
      const workPath = join(__dirname, 'fixtures', fixtureName);

      const fileList = await readDirectoryRecursively(workPath);
      const vercelJson = await readFile(join(workPath, 'vercel.json'), 'utf8');
      const vercelJsonObject = JSON.parse(vercelJson);
      config.projectSettings = {
        ...config.projectSettings,
        ...vercelJsonObject,
      };

      const files = createFiles(workPath, fileList);
      const result = (await build({
        files,
        workPath,
        config,
        meta,
        entrypoint: 'package.json',
        repoRootPath: workPath,
      })) as BuildResultV2Typical;

      const expectedFilePath = join(workPath, 'files.json');
      if (existsSync(expectedFilePath)) {
        const expectedFiles = await readFile(expectedFilePath, 'utf8');
        const indexOutput = result.output.index;
        if ('type' in indexOutput && indexOutput.type === 'Lambda') {
          if (Array.isArray(files)) {
            expect(files).toEqual(
              expect.arrayContaining(JSON.parse(expectedFiles))
            );
          }
        }
      }

      expect(JSON.stringify(result.routes, null, 2)).toMatchFileSnapshot(
        join(workPath, 'routes.json')
      );
    }, 10000);
  }
});
