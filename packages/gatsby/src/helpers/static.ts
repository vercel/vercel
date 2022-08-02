import { join, parse, basename, relative } from 'path';
import { FileFsRef, glob } from '@vercel/build-utils';

export async function createStaticOutput({ staticDir }: { staticDir: string }) {
  const staticOutput: Record<string, FileFsRef> = {};

  const staticFiles = await glob('**', staticDir);

  for (const [fileName, fileFsRef] of Object.entries(staticFiles)) {
    const parsedPath = parse(fileFsRef.fsPath);

    if (parsedPath.ext !== '.html') {
      staticOutput[fileName] = fileFsRef;
    } else {
      const fileNameWithoutExtension = basename(fileName, '.html');

      const pathWithoutHtmlExtension = join(
        parsedPath.dir,
        fileNameWithoutExtension
      );

      fileFsRef.contentType = 'text/html; charset=utf-8';

      staticOutput[relative(staticDir, pathWithoutHtmlExtension)] = fileFsRef;
    }
  }

  return staticOutput;
}
