import { join, dirname } from 'path';
import { copy, move, ensureDir } from 'fs-extra';

export async function createStaticDir(prefix?: string) {
  const publicDir = join(process.cwd(), 'public');
  const targetDir = join(
    process.cwd(),
    '.vercel',
    'output',
    'static',
    prefix ?? ''
  );
  await ensureDir(dirname(targetDir));
  try {
    await move(publicDir, targetDir);
  } catch (err: any) {
    console.log('failed to move "public" dir', err);
    await copy(publicDir, targetDir);
  }
}
