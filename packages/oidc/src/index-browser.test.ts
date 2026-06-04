import { describe, test, expect, vi } from 'vitest';

vi.mock('@vercel/cli-exec', () => ({
  execVercelCli: vi.fn(),
  VercelCliError: class VercelCliError extends Error {},
}));

import * as DefaultImports from './index';
import * as BrowserImports from './index-browser';

describe('browser export', () => {
  test('should match the default export', async () => {
    expect(Object.keys(BrowserImports).sort()).toStrictEqual(
      Object.keys(DefaultImports).sort()
    );
  });
});
