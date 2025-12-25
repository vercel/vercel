import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'path';
import { writeJSON, mkdirp, writeFile, pathExists } from 'fs-extra';
import { unlinkProject } from '../../../../src/util/projects/unlink';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

describe('unlinkProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when .vercel directory does not exist', async () => {
    const cwd = setupTmpDir();
    const result = await unlinkProject(client, cwd);

    expect(result).toEqual({
      success: false,
    });
  });

  it('should remove .vercel directory successfully', async () => {
    const cwd = setupTmpDir();

    // Create .vercel directory and files
    const vercelDir = join(cwd, '.vercel');
    await mkdirp(vercelDir);
    await writeJSON(join(vercelDir, 'project.json'), { test: 'data' });
    await writeFile(join(vercelDir, 'README.txt'), 'test content');

    const result = await unlinkProject(client, cwd);

    expect(result.success).toBe(true);
    expect(await pathExists(vercelDir)).toBe(false);
  });

  it('should handle multiple files in .vercel directory', async () => {
    const cwd = setupTmpDir();

    // Create .vercel directory with multiple files
    const vercelDir = join(cwd, '.vercel');
    await mkdirp(vercelDir);
    await writeJSON(join(vercelDir, 'project.json'), { test: 'data' });
    await writeFile(join(vercelDir, 'README.txt'), 'test content');
    await writeFile(join(vercelDir, 'other-file.txt'), 'other content');

    const result = await unlinkProject(client, cwd);

    expect(result.success).toBe(true);
    expect(await pathExists(vercelDir)).toBe(false);
  });
});
