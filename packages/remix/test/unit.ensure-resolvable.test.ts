import { join } from 'path';
import { promises as fs } from 'fs';
import { ensureResolvable } from '../src/utils';

const FIXTURES_DIR = join(__dirname, 'fixtures-legacy');

describe('ensureResolvable()', () => {
  it('should create a symlink in the node_modules within `start` with pnpm', async () => {
    const FIXTURE = join(FIXTURES_DIR, '00-pnpm');
    const start = join(FIXTURE, 'apps/a');
    try {
      await fs.mkdir(join(start, 'node_modules'), { recursive: true });
      await ensureResolvable(start, FIXTURE, 'ms');
      const stat = await fs.lstat(join(start, 'node_modules/ms'));
      expect(stat.isSymbolicLink()).toEqual(true);
    } finally {
      await fs.rm(start, { recursive: true });
    }
  });
});
