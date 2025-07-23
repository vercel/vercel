import { FileFsRef, Files } from '@vercel/build-utils/dist';
import { build } from '../../src/build';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import fs from 'fs';

const config = {
  outputDirectory: undefined,
  zeroConfig: true,
  framework: 'hono',
  projectSettings: {
    createdAt: 1752690985471,
    framework: 'hono',
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
const meta = { skipDownload: true, cliVersion: '44.4.1' };

const createFiles = (workPath: string, fileList: string[]) => {
  const files: Files = {};
  for (const path of fileList) {
    files[path] = new FileFsRef({
      fsPath: join(workPath, path),
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
  '01-src-index-on-edge': {
    function: 'EdgeFunction',
  },
  '02-src-index-on-node': {
    function: 'Lambda',
  },
  '03-index-on-node': {
    function: 'Lambda',
  },
  '04-indexjs-on-node': {
    function: 'Lambda',
  },
  '05-indexmjs-on-node': {
    function: 'Lambda',
  },
  '06-indexcjs-on-node': {
    function: 'Lambda',
  },
};

describe('build', () => {
  for (const [fixtureName, fixtureConfig] of Object.entries(fixtures)) {
    it(`should build ${fixtureName}`, async () => {
      const workPath = join(__dirname, '../fixtures', fixtureName);

      // Read directory recursively to get all files
      const fileList = readDirectoryRecursively(workPath);

      const files = createFiles(workPath, fileList);
      const result = await build({
        files,
        workPath,
        config,
        meta,
        // Entrypoint is just used as the BOA function name
        entrypoint: 'index.ts',
        repoRootPath: workPath,
      });

      expect(result.output.type).toBe(fixtureConfig.function);
      if ('entrypoint' in result.output) {
        expect(result.output.entrypoint).toBe('shim.js');
      } else if ('handler' in result.output) {
        expect(result.output.handler).toBe('shim.js');
      } else {
        throw new Error('entrypoint is not defined');
      }
    });
  }
});
