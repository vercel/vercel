import type { Quirk, QuirkResult } from './index';

/**
 * Resolves the following:
 * Matplotlib created a temporary cache directory at /tmp/matplotlib-1id0p556 because the default path (/home/sbx_user1051/.config/matplotlib)
 * is not a writable directory; it is highly recommended to set the MPLCONFIGDIR environment variable to a writable directory,
 * in particular to speed up the import of Matplotlib and to better support multiprocessing.
 */
export const matplotlibQuirk: Quirk = {
  dependency: 'matplotlib',
  async run(): Promise<QuirkResult> {
    return {
      env: { MPLCONFIGDIR: '/tmp' },
    };
  },
};
