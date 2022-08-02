import { join } from 'path';
import { build } from 'esbuild';
import { FileFsRef, NodeVersion, glob } from '@vercel/build-utils';
import { pathExists } from 'fs-extra';

export const getHandler = async ({
  nodeVersion,
  handlerFile,
}: {
  nodeVersion: NodeVersion;
  handlerFile: string;
}): Promise<string> => {
  const res = await build({
    entryPoints: [handlerFile],
    loader: { '.ts': 'ts' },
    write: false,
    format: 'cjs',
    target: `node${nodeVersion.major}`,
    platform: 'node',
    bundle: true,
    minify: true,
    define: {
      'process.env.NODE_ENV': "'production'",
    },
  });

  return res.outputFiles[0].text;
};

export async function getFunctionLibsFiles(): Promise<
  Record<string, FileFsRef>
> {
  /* Copies the required libs for Serverless Functions from .cache to the <name>.func folder */
  return [
    {
      name: 'lib/query-engine',
      src: join('.cache', 'query-engine'),
    },
    {
      name: 'lib/page-ssr',
      src: join('.cache', 'page-ssr'),
    },
    {
      name: 'assets/data/datastore',
      src: join('.cache', 'data', 'datastore'),
    },
    {
      name: 'cache/caches',
      src: join('.cache', 'caches'),
    },
  ].reduce(async (acc, cur) => {
    const staticFiles = await glob('**', join(process.cwd(), cur.src));

    for (const [fileName, fileFsRef] of Object.entries(staticFiles)) {
      acc[fileName] = fileFsRef;
    }

    return acc;
  }, {});
}

export async function getFunctionHTMLFiles() {
  /* If available, copies the 404.html and 500.html files to the <name>.func/lib folder */
  for (const htmlFile of ['404', '500']) {
    if (await pathExists(join('public', `${htmlFile}.html`))) {
      return {
        [`${htmlFile}.html`]: await FileFsRef.fromFsPath({
          fsPath: join('public', `${htmlFile}.html`),
        }),
      };
    }
  }
}
