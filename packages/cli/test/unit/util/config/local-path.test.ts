import path from 'path';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import getLocalPathConfig, {
  localConfigFlagPath,
} from '../../../../src/util/config/local-path';

const originalArgv = process.argv;

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
});

describe('localConfigFlagPath', () => {
  it('is the --local-config file, resolved against the invocation cwd', () => {
    process.argv = ['node', 'vercel', 'dev', '--local-config', 'dev.json'];
    vi.spyOn(process, 'cwd').mockReturnValue('/repo/root');

    expect(localConfigFlagPath()).toBe(path.resolve('/repo/root', 'dev.json'));
  });

  it('is undefined without the flag', () => {
    process.argv = ['node', 'vercel', 'dev'];

    expect(localConfigFlagPath()).toBeUndefined();
  });
});

describe('getLocalPathConfig', () => {
  it('resolves --local-config relative to the invocation cwd', () => {
    process.argv = [
      'node',
      'vercel',
      'deploy',
      'target',
      '--local-config',
      './config.json',
    ];
    vi.spyOn(process, 'cwd').mockReturnValue('/repo/root');

    expect(getLocalPathConfig('/repo/root/target')).toBe(
      path.resolve('/repo/root', './config.json')
    );
    expect(getLocalPathConfig('/repo/root/target', false)).toBe(
      path.resolve('/repo/root', './config.json')
    );
  });

  it('can ignore orphaned compiled output in dev without changing other config consumers', async () => {
    process.argv = ['node', 'vercel'];
    const cwd = await mkdtemp(path.join(tmpdir(), 'vc-config-path-'));
    const compiled = path.join(cwd, '.vercel', 'vercel.json');
    try {
      await mkdir(path.dirname(compiled));
      await writeFile(compiled, '{}');
      expect(getLocalPathConfig(cwd)).toBe(compiled);
      expect(getLocalPathConfig(cwd, false)).toBe(
        path.join(cwd, 'vercel.json')
      );
      process.argv.push('--local-config', compiled);
      expect(getLocalPathConfig(cwd, false)).toBe(compiled);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
