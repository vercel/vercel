import { FileFsRef } from '@vercel/build-utils';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { findEntrypoint } from '../../src/build';

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
