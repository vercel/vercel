import fs from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import { expect, it } from 'vitest';
import { getFramework } from '../../src/do-build';

it.each([
  '@vercel/next@latest',
  '@now/next',
])('recognizes %s as the executed Next.js builder', async runtime => {
  const cwd = await fs.mkdtemp(join(tmpdir(), 'vc-framework-metadata-'));
  try {
    await fs.writeJSON(join(cwd, 'package.json'), {
      dependencies: { next: '13.3.0' },
    });
    const results = new Map([
      [{ use: runtime, src: 'package.json' }, { version: 3 }],
    ]) as Parameters<typeof getFramework>[1];
    expect(await getFramework(cwd, results)).toEqual({
      slug: 'nextjs',
      version: '13.3.0',
    });
  } finally {
    await fs.remove(cwd);
  }
});
