import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { Span } from '@vercel/build-utils';
import { typescript } from '../src/typescript';

const require_ = createRequire(import.meta.url);

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))
  );
});

async function createFixture(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'backends-typescript-'));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    const filePath = join(dir, name);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }
  // Make the repo's `typescript` install resolvable from the fixture.
  const tsDir = dirname(require_.resolve('typescript/package.json'));
  await mkdir(join(dir, 'node_modules'), { recursive: true });
  await symlink(tsDir, join(dir, 'node_modules/typescript'));
  return dir;
}

function typecheck(workPath: string, entrypoint: string) {
  return typescript({
    entrypoint,
    workPath,
    span: new Span({ name: 'test' }),
    nodeVersionMajor: 22,
  });
}

describe('typescript typecheck leniencies (parity with @vercel/node)', () => {
  it('fails on real type errors', async () => {
    const dir = await createFixture({
      'index.ts': 'const n: number = "not a number";\nexport default n;\n',
    });
    await expect(typecheck(dir, 'index.ts')).rejects.toThrow(
      'TypeScript type check failed'
    );
  });

  it('ignores an empty "files" list in tsconfig (TS18002)', async () => {
    const dir = await createFixture({
      'tsconfig.json': JSON.stringify({ files: [] }),
      'index.ts': 'export const ok: number = 1;\n',
    });
    await expect(typecheck(dir, 'index.ts')).resolves.toBeUndefined();
  });

  it('forces strict off when "module" is not set in tsconfig', async () => {
    const dir = await createFixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { strict: true },
      }),
      // Implicit-any parameter: fails under strict, passes without it.
      'index.ts': 'export const fn = a => a;\n',
    });
    await expect(typecheck(dir, 'index.ts')).resolves.toBeUndefined();
  });

  it('does not override an explicit "moduleResolution" (e.g. bundler)', async () => {
    const dir = await createFixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { moduleResolution: 'bundler', module: 'ESNext' },
      }),
      // Extensionless relative import: fails under forced NodeNext
      // resolution, passes under the user's bundler resolution.
      'lib.ts': 'export const value: number = 1;\n',
      'index.ts': "export { value } from './lib';\n",
    });
    await expect(typecheck(dir, 'index.ts')).resolves.toBeUndefined();
  });

  it('discovers tsconfig from the entrypoint directory, not workPath', async () => {
    const dir = await createFixture({
      // Malformed tsconfig at the workPath root: fatal if read.
      'tsconfig.json': '{ not valid json',
      'api/tsconfig.json': JSON.stringify({
        compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext' },
      }),
      'api/index.ts': 'export const ok: number = 1;\n',
    });
    await expect(typecheck(dir, 'api/index.ts')).resolves.toBeUndefined();
  });
});
