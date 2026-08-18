import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BuildOptions } from '@vercel/build-utils';
import { getOutputDirectorySetting, maybeDoBuildCommand } from '../src/build';

describe('getOutputDirectorySetting', () => {
  it('reads config.outputDirectory', () => {
    expect(getOutputDirectorySetting({ outputDirectory: 'dist' })).toBe('dist');
  });

  it('falls back to config.projectSettings.outputDirectory', () => {
    expect(
      getOutputDirectorySetting({
        projectSettings: { outputDirectory: 'build' },
      })
    ).toBe('build');
  });

  it('prefers config.outputDirectory over projectSettings', () => {
    expect(
      getOutputDirectorySetting({
        outputDirectory: 'dist',
        projectSettings: { outputDirectory: 'build' },
      })
    ).toBe('dist');
  });

  it('returns undefined when unset or empty', () => {
    expect(getOutputDirectorySetting({})).toBeUndefined();
    expect(getOutputDirectorySetting({ outputDirectory: '' })).toBeUndefined();
    expect(getOutputDirectorySetting({ projectSettings: {} })).toBeUndefined();
  });
});

describe('maybeDoBuildCommand', () => {
  let workPath: string;

  beforeEach(async () => {
    workPath = await mkdtemp(join(tmpdir(), 'backends-build-'));
  });

  afterEach(async () => {
    await rm(workPath, { recursive: true, force: true });
  });

  const makeArgs = (config: BuildOptions['config']): BuildOptions =>
    ({
      files: {},
      entrypoint: 'package.json',
      workPath,
      repoRootPath: workPath,
      config,
      meta: {},
    }) as unknown as BuildOptions;

  const downloadResult = {
    spawnEnv: { ...process.env },
  } as Parameters<typeof maybeDoBuildCommand>[1];

  it('discovers entrypoint in configured outputDirectory after build command runs', async () => {
    await mkdir(join(workPath, 'out'), { recursive: true });
    await writeFile(join(workPath, 'out', 'index.js'), '// server', 'utf-8');

    const result = await maybeDoBuildCommand(
      makeArgs({
        outputDirectory: 'out',
        projectSettings: { buildCommand: 'true' },
      }),
      downloadResult
    );

    expect(result.outputDir).toBe(join(workPath, 'out'));
    expect(result.handler).toBe('index.js');
    expect(result.files).toBeDefined();
  });

  it('discovers entrypoint via projectSettings.outputDirectory', async () => {
    await mkdir(join(workPath, 'out'), { recursive: true });
    await writeFile(join(workPath, 'out', 'index.js'), '// server', 'utf-8');

    const result = await maybeDoBuildCommand(
      makeArgs({
        projectSettings: { buildCommand: 'true', outputDirectory: 'out' },
      }),
      downloadResult
    );

    expect(result.outputDir).toBe(join(workPath, 'out'));
    expect(result.handler).toBe('index.js');
  });

  it('falls back to common output directories when no outputDirectory is set', async () => {
    // Previously unreachable: the dist/build/output fallback was gated behind
    // `buildCommandResult && outputSetting` with an `if (outputSetting)` that
    // made the `else` branch dead code.
    await mkdir(join(workPath, 'dist'), { recursive: true });
    await writeFile(join(workPath, 'dist', 'index.js'), '// server', 'utf-8');

    const result = await maybeDoBuildCommand(
      makeArgs({ projectSettings: { buildCommand: 'true' } }),
      downloadResult
    );

    expect(result.outputDir).toBe(join(workPath, 'dist'));
    expect(result.handler).toBe('index.js');
  });

  it('skips output directory discovery when outputDirectory is the project root', async () => {
    await writeFile(join(workPath, 'index.js'), '// server', 'utf-8');

    const result = await maybeDoBuildCommand(
      makeArgs({
        outputDirectory: '.',
        projectSettings: { buildCommand: 'true' },
      }),
      downloadResult
    );

    expect(result.outputDir).toBeUndefined();
    expect(result.handler).toBeUndefined();
  });

  it('returns no output dir when the build command does not run', async () => {
    await mkdir(join(workPath, 'dist'), { recursive: true });
    await writeFile(join(workPath, 'dist', 'index.js'), '// server', 'utf-8');
    // No buildCommand and no package.json `build` script.
    await writeFile(
      join(workPath, 'package.json'),
      JSON.stringify({ name: 'x' }),
      'utf-8'
    );

    const result = await maybeDoBuildCommand(makeArgs({}), downloadResult);

    expect(result.outputDir).toBeUndefined();
    expect(result.handler).toBeUndefined();
  });
});
