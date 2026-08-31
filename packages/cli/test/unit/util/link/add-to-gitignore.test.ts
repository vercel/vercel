import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir, EOL } from 'node:os';
import { join } from 'node:path';
import { addToGitIgnore } from '../../../../src/util/link/add-to-gitignore';

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'add-to-gitignore-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('addToGitIgnore()', () => {
  it('should create a `.gitignore` with the entry when none exists', async () => {
    await withTempDir(async dir => {
      const updated = await addToGitIgnore(dir, '.env*');
      expect(updated).toBe(true);
      const contents = await readFile(join(dir, '.gitignore'), 'utf8');
      expect(contents).toBe(`.env*${EOL}`);
    });
  });

  it('should not duplicate an entry that already exists with LF line endings', async () => {
    await withTempDir(async dir => {
      const gitIgnorePath = join(dir, '.gitignore');
      await writeFile(gitIgnorePath, '.env*\n');

      const updated = await addToGitIgnore(dir, '.env*');
      expect(updated).toBe(false);

      const contents = await readFile(gitIgnorePath, 'utf8');
      expect(contents).toBe('.env*\n');
    });
  });

  it('should not duplicate an entry that already exists with CRLF line endings', async () => {
    await withTempDir(async dir => {
      const gitIgnorePath = join(dir, '.gitignore');
      await writeFile(gitIgnorePath, '.env*\r\n');

      const updated = await addToGitIgnore(dir, '.env*');
      expect(updated).toBe(false);

      const contents = await readFile(gitIgnorePath, 'utf8');
      expect(contents).toBe('.env*\r\n');
    });
  });

  it('should not repeatedly re-add the entry across multiple calls (Windows w/ LF-configured git)', async () => {
    await withTempDir(async dir => {
      const gitIgnorePath = join(dir, '.gitignore');
      // Simulates a `.gitignore` using LF endings, as would be the case on
      // Windows when Git is configured to use LF line endings.
      await writeFile(gitIgnorePath, '.env*\n');

      // Calling `addToGitIgnore()` multiple times (as `vercel env pull` does
      // on every invocation) should not keep appending duplicate entries
      // with mismatched line endings.
      for (let i = 0; i < 3; i++) {
        const updated = await addToGitIgnore(dir, '.env*');
        expect(updated).toBe(false);
      }

      const contents = await readFile(gitIgnorePath, 'utf8');
      expect(contents).toBe('.env*\n');
    });
  });

  it('should append the entry when it does not already exist', async () => {
    await withTempDir(async dir => {
      const gitIgnorePath = join(dir, '.gitignore');
      await writeFile(gitIgnorePath, 'node_modules\n');

      const updated = await addToGitIgnore(dir, '.env*');
      expect(updated).toBe(true);

      const contents = await readFile(gitIgnorePath, 'utf8');
      expect(contents).toBe('node_modules\n.env*\n');
    });
  });
});
