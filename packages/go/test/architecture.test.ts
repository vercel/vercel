import assert from 'assert';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirp, readFile, remove, writeFile } from 'fs-extra';
import { build } from '../src';
import { glob } from '@vercel/build-utils';

const ELF_MACHINE_OFFSET = 18;
const ELF_MACHINE_X86_64 = 62;
const ELF_MACHINE_AARCH64 = 183;

describe('function architecture', () => {
  const testDir = join(tmpdir(), 'vercel-go-test-architecture');

  beforeEach(async () => {
    await remove(testDir);
    await mkdirp(testDir);
    await writeFile(join(testDir, 'go.mod'), 'module handler\n\ngo 1.24\n');
    await writeFile(
      join(testDir, 'index.go'),
      [
        'package handler',
        'import "net/http"',
        'func Handler(w http.ResponseWriter, r *http.Request) {}',
      ].join('\n')
    );
  });

  afterEach(async () => {
    await remove(testDir);
  });

  async function buildHandler(functions?: {
    [key: string]: { architecture: 'arm64' };
  }) {
    const built = await build({
      files: await glob('**', testDir),
      entrypoint: 'index.go',
      workPath: testDir,
      repoRootPath: testDir,
      config: { functions },
      meta: { skipDownload: true },
    });
    assert(built.resultVersion === 3);
    const lambda = built.result.output;
    assert(lambda.type === 'Lambda');
    const bootstrap = lambda.files?.bootstrap;
    assert(bootstrap?.type === 'FileFsRef');
    const binary = await readFile(bootstrap.fsPath);
    return {
      architecture: lambda.architecture,
      machine: binary.readUInt16LE(ELF_MACHINE_OFFSET),
    };
  }

  it('compiles for x86_64 and declares x86_64 by default', async () => {
    expect(await buildHandler()).toEqual({
      architecture: 'x86_64',
      machine: ELF_MACHINE_X86_64,
    });
  });

  it('compiles for arm64 and declares arm64 when configured', async () => {
    expect(
      await buildHandler({ 'index.go': { architecture: 'arm64' } })
    ).toEqual({
      architecture: 'arm64',
      machine: ELF_MACHINE_AARCH64,
    });
  });
});
