import { join } from 'path';
import { copy } from 'fs-extra';
import { hardLinkDir } from './hard-link-dir';

export async function createStaticDir(prefix?: string) {
  const publicDir = join(process.cwd(), 'public');
  const targetDir = join(
    process.cwd(),
    '.vercel',
    'output',
    'static',
    prefix ?? ''
  );

  try {
    await hardLinkDir(publicDir, [targetDir]);
  } catch (err: any) {
    console.error(
      `Failed to hardlink "public" dir files from "${publicDir}" to "${targetDir}". Copying instead.`,
      err
    );
    await copy(publicDir, targetDir);
  }
}
