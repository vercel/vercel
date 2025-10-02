import { describe, test, expect } from 'vitest';

import * as DefaultImports from './index';
import * as BrowserImports from './index-browser';

describe('browser export', () => {
  test('should match the default export', async () => {
    expect(Object.keys(BrowserImports)).toStrictEqual(
      Object.keys(DefaultImports)
    );
  });
});
