import { afterEach, describe, expect, it, vi } from 'vitest';
import { liveWorkingDirectory } from '../../src/gateways/working-directory';

describe('liveWorkingDirectory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the process working directory', () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/work');

    expect(liveWorkingDirectory().current()).toBe('/work');
  });

  it('changes the process working directory', () => {
    const chdir = vi.spyOn(process, 'chdir').mockImplementation(() => {});

    liveWorkingDirectory().change({ dir: '/work/app' });

    expect(chdir).toHaveBeenCalledWith('/work/app');
  });
});
