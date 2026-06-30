import { FileFsRef } from '@vercel/build-utils';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import type { Files } from '@vercel/build-utils';
import { glob } from 'glob';

export type Fs = Record<string, Buffer | string | { copy: string }>;

export type Filesystem = {
  workPath: string;
  repoRootPath: string;
  files: Files;
};

export async function prepareFilesystem(
  files: Fs,
  folderPrefix = 'vercel-node-tests',
  workPathPrefix = ''
): Promise<Filesystem> {
  const directory = join(tmpdir(), `${folderPrefix}-${Date.now()}`);
  const workPath = workPathPrefix ? join(directory, workPathPrefix) : directory;
  await fs.mkdir(workPath, { recursive: true });
  const fileRefs: Files = {};
  for (const [key, value] of Object.entries(files)) {
    const fullPath = join(workPath, key);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    if (typeof value === 'string' || value instanceof Buffer) {
      await fs.writeFile(join(workPath, key), value);
    } else if (typeof value.copy === 'string') {
      await fs.copyFile(join(workPath, value.copy), join(workPath, key));
    }
    fileRefs[key] = await FileFsRef.fromFsPath({
      fsPath: join(workPath, key),
    });
  }
  return {
    workPath,
    repoRootPath: directory,
    files: fileRefs,
  };
}

export async function prepareFixtureFilesystem(
  fixtureName: string,
  folderPrefix = 'vercel-node-fixtures'
): Promise<Filesystem> {
  const fixtureDir = join(__dirname, '../unit-fixtures', fixtureName);
  const fixtureFiles: Fs = {};
  const paths = await glob('**/*', {
    cwd: fixtureDir,
    nodir: true,
    dot: true,
  });

  for (const relativePath of paths) {
    fixtureFiles[relativePath] = await fs.readFile(
      join(fixtureDir, relativePath)
    );
  }

  return prepareFilesystem(fixtureFiles, folderPrefix);
}
