import { join } from 'path';
import { copy, ensureDir } from 'fs-extra';

export async function createStaticDir(prefix?: string) {
  const targetDir = join(
    process.cwd(),
    '.vercel',
    'output',
    'static',
    prefix ?? ''
  );
  await ensureDir(targetDir);
  await copy(join(process.cwd(), 'public'), targetDir);
}
