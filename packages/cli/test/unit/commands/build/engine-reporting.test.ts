import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import { join } from 'node:path';
import {
  getWriteableDirectory,
  NowBuildError,
  type BuilderV2,
} from '@vercel/build-utils';
import build from '../../../../src/commands/build';
import * as builders from '../../../../src/builders/import-builders';
import { toEnumerableError } from '../../../../src/util/error';
import { client } from '../../../mocks/client';
import { runAsAgent } from '../../../helpers/run-as-agent';

const errorCodes = () =>
  client.telemetryEventStore.readonlyEvents
    .filter(e => e.key === 'error_code')
    .map(e => e.value);

describe('build engine reporting through the CLI', () => {
  let builder: BuilderV2;
  let cwd: string;
  beforeEach(async () => {
    delete process.env.__VERCEL_BUILD_RUNNING;
    cwd = client.cwd = await getWriteableDirectory();
    client.setArgv('build');
    client.nonInteractive = true;
    await fs.outputJSON(join(cwd, '.vercel/project.json'), {
      orgId: '.',
      projectId: '.',
      settings: { framework: null, installCommand: '' },
    });
    await fs.writeJSON(join(cwd, 'vercel.json'), {
      builds: [{ src: 'index.py', use: '@vercel/python' }],
    });
    await fs.writeFile(join(cwd, 'index.py'), '');
    builder = { version: 2, build: async () => ({ output: {} }) };
    const imported = {
      path: '',
      pkgPath: '',
      builder,
      dynamicallyInstalled: false,
      pkg: { name: '@vercel/python', version: '1.0.0' },
    };
    vi.spyOn(builders, 'importBuilders').mockResolvedValue(
      new Map([['@vercel/python', imported]])
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('reports a diagnostic thrown by the real engine with one stable code', async () => {
    vi.mocked(builders.importBuilders).mockResolvedValue(new Map());
    expect(await build(client)).toBe(1);
    const output = client.stderr.getFullOutput();
    expect(output).toContain('Error: [BUILD_BUILDER_LOAD_FAILED]');
    expect(output).toContain('Fix: Check that the builder is installed');
    expect(errorCodes()).toEqual(['BUILD_BUILDER_LOAD_FAILED']);
    const manifest = await fs.readJSON(join(cwd, '.vercel/output/builds.json'));
    expect(manifest.error).toMatchObject({
      name: 'BUILD_BUILDER_LOAD_FAILED',
      message: 'Failed to load Builder "@vercel/python"',
    });
    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      status: 'error',
      reason: 'build_failed',
      message: manifest.error.message,
    });
  });

  it('preserves upstream error codes, manifests and the JSON schema', async () => {
    const primary = new NowBuildError({
      code: 'TEST_PRIMARY_FAILURE',
      message: 'Primary build failure',
      link: 'https://example.com/docs',
      action: 'View Documentation',
    });
    builder.build = async () => {
      throw primary;
    };
    expect(await build(client)).toBe(1);
    const output = client.stderr.getFullOutput();
    const manifest = await fs.readJSON(join(cwd, '.vercel/output/builds.json'));
    expect(manifest.error).toEqual(toEnumerableError(primary));
    expect(manifest.builds[0].error).toEqual(toEnumerableError(primary));
    expect(output.match(/\[TEST_PRIMARY_FAILURE\]/g)).toHaveLength(1);
    expect(output).toContain('View Documentation:');
    expect(errorCodes()).toEqual(['TEST_PRIMARY_FAILURE']);
    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(Object.keys(payload).sort()).toEqual([
      'message',
      'next',
      'reason',
      'status',
    ]);
    expect(payload).toMatchObject({
      status: 'error',
      reason: 'build_failed',
      message: primary.message,
    });
  });

  it.each([
    ['an internal diagnostic', 'BUILD_BUILDER_LOAD_FAILED'],
    ['an upstream coded error', 'TEST_PRIMARY_FAILURE'],
  ])('sends one specific code for an agent run with %s', async (_, code) => {
    if (code === 'BUILD_BUILDER_LOAD_FAILED') {
      vi.mocked(builders.importBuilders).mockResolvedValue(new Map());
    } else {
      builder.build = async () => {
        throw new NowBuildError({ code, message: 'Primary build failure' });
      };
    }
    expect(await runAsAgent(() => build(client))).toBe(1);
    // The agent still sees the generic reason, but telemetry gets the specific code
    expect(JSON.parse(client.stdout.getFullOutput()).reason).toBe(
      'build_failed'
    );
    expect(errorCodes()).toEqual([code]);
  });
});
