import { join } from 'node:path';
import { hardLinkDir } from '@vercel/build-utils';

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
    console.error(err);
    throw new Error(
      `Failed to hardlink (or copy) "public" dir files from "${publicDir}" to "${targetDir}".`
    );
  }
}
