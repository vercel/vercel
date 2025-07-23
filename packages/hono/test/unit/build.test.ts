import { FileFsRef, Files } from '@vercel/build-utils/dist';
import { build } from '../../src/build';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

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

describe('build', () => {
  it('', async () => {
    const workPath = join(__dirname, '../fixtures/01-src-index-on-edge');

    const fileList = [
      'tsconfig.json',
      'package.json',
      'src/index.ts',
      'other/stuff.ts',
    ];

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
    expect(result.output.type).toBe('EdgeFunction');
    if ('entrypoint' in result.output) {
      expect(result.output.entrypoint).toBe('shim.js');
    } else {
      throw new Error('entrypoint is not defined');
    }
  });
});
