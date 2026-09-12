import type { Framework } from '@vercel/frameworks';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getNodeExecPath: vi.fn(),
}));

vi.mock('@vercel/build-utils', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/build-utils')>()),
  getNodeExecPath: mocks.getNodeExecPath,
}));

import { detectFrameworkVersion } from '../src/detect-framework';

const framework = {
  slug: 'nextjs',
  detectors: {
    every: [{ matchPackage: 'next' }],
  },
} as Framework;

describe('detectFrameworkVersion()', () => {
  beforeEach(() => {
    mocks.getNodeExecPath.mockReset();
  });

  it('returns undefined when Node.js is unavailable', () => {
    mocks.getNodeExecPath.mockImplementation(() => {
      throw new Error('Could not find the Node.js executable in PATH.');
    });
    const consoleDebug = vi
      .spyOn(console, 'debug')
      .mockImplementation(() => undefined);

    expect(detectFrameworkVersion(framework)).toBeUndefined();
    expect(consoleDebug).toHaveBeenCalledWith(
      expect.stringContaining(
        'Error looking up version of installed package "next"'
      )
    );

    consoleDebug.mockRestore();
  });
});
