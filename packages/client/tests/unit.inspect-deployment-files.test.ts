import fs from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectDeploymentFiles } from '../src/inspect-deployment-files';

describe('inspectDeploymentFiles()', () => {
  let cwd: string | undefined;

  afterEach(async () => {
    if (cwd) {
      await fs.remove(cwd);
      cwd = undefined;
    }
  });

  it('includes empty directories in the deployment file summary', async () => {
    cwd = await fs.mkdtemp(join(tmpdir(), 'vercel-client-inspect-'));
    await fs.ensureDir(join(cwd, 'empty'));
    await fs.outputFile(join(cwd, 'index.txt'), 'hello');

    const summary = await inspectDeploymentFiles({ path: cwd });

    expect(summary.fileCount).toBe(2);
    expect(summary.totalSize).toBe(5);
    expect(summary.files).toEqual([
      {
        path: 'empty',
        size: 0,
        mode: expect.any(Number),
      },
      {
        path: 'index.txt',
        size: 5,
        mode: expect.any(Number),
        sha: expect.any(String),
      },
    ]);
  });
});
