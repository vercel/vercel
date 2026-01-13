import { describe, it, expect } from 'vitest';
import { findEntrypoint } from '../../src/build';
import { FileFsRef } from '@vercel/build-utils';
import { join } from 'path';

describe('koa builder', () => {
  it('should find entrypoint', async () => {
    const files = {
      'index.js': new FileFsRef({
        fsPath: join(process.cwd(), 'test/fixtures/01-basic/index.js'),
      }),
    };

    const { entrypoint } = findEntrypoint(files);
    expect(entrypoint).toBe('index.js');
  });
});
