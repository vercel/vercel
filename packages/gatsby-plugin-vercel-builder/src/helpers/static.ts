import { join, dirname } from 'path';
import { copy, ensureDir, link, readdir, stat } from 'fs-extra';

async function hardlinkFileTree(
  rootAbsolutePath: string,
  targetAbsolutePath: string,
  currentRelativePath = '.'
) {
  console.log(
    `hardlinkFileTree("${rootAbsolutePath}", "${targetAbsolutePath}", "${currentRelativePath}");`
  );

  const currentAbsolutePath = join(rootAbsolutePath, currentRelativePath);
  const realtiveFilePaths = await readdir(currentAbsolutePath);

  for (const relativePath of realtiveFilePaths) {
    const currentAbsoluteSubPath = join(currentAbsolutePath, relativePath);
    const currentPathStat = await stat(currentAbsoluteSubPath);
    if (currentPathStat.isDirectory()) {
      await hardlinkFileTree(
        rootAbsolutePath,
        targetAbsolutePath,
        join(currentRelativePath, relativePath)
      );
    } else {
      const linkDestPath = join(
        targetAbsolutePath,
        currentRelativePath,
        relativePath
      );

      console.log(`link("${currentAbsoluteSubPath}", "${linkDestPath}");`);

      await link(currentAbsoluteSubPath, linkDestPath);
    }
  }
}

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
    await hardlinkFileTree(publicDir, targetDir);
  } catch (err: any) {
    console.error(
      `Failed to hardlink "public" dir files from "${publicDir}" to "${targetDir}". Copying instead.`,
      err
    );
    await copy(publicDir, targetDir);
  }
}
