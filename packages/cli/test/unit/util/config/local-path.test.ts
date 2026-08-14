import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import getLocalPathConfig from '../../../../src/util/config/local-path';

const originalArgv = process.argv;

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
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
  });
});
