import { join } from 'path';
import { build } from 'esbuild';
import { getNodeVersion } from '@vercel/build-utils';
import {
  copy,
  copyFile,
  pathExists,
  writeJson,
  writeFileSync,
  ensureFileSync,
} from 'fs-extra';

import type {
  NodejsServerlessFunctionConfig,
  PrerenderFunctionConfig,
} from '../types';

export const writeHandler = async ({
  outDir,
  handlerFile,
}: {
  outDir: string;
  handlerFile: string;
}) => {
  const { major } = await getNodeVersion(process.cwd());

  try {
    return await build({
      entryPoints: [handlerFile],
      loader: { '.ts': 'ts' },
      outfile: join(outDir, './index.js'),
      format: 'cjs',
      target: `node${major}`,
      platform: 'node',
      bundle: true,
      minify: true,
      define: {
        'process.env.NODE_ENV': "'production'",
      },
    });
  } catch (e: any) {
    console.error('Failed to build lambda handler', e.message);
  }
};

export const writeVCConfig = async ({
  functionDir,
  handler = 'index.js',
}: {
  functionDir: string;
  handler?: string;
}) => {
  const { runtime } = await getNodeVersion(process.cwd());

  const config: NodejsServerlessFunctionConfig = {
    runtime,
    handler,
    launcherType: 'Nodejs',
    shouldAddHelpers: true,
  };

  return writeJson(`${functionDir}/.vc-config.json`, config);
};

export const writePrerenderConfig = (outputPath: string) => {
  const config: PrerenderFunctionConfig = {
    expiration: false,
  };

  ensureFileSync(outputPath);
  return writeFileSync(outputPath, JSON.stringify(config));
};

export async function movePageData({ functionDir }: { functionDir: string }) {
  await copy(
    join('.vercel', 'output', 'static', 'page-data'),
    join(functionDir, 'page-data')
  );
}

export async function copyFunctionLibs({
  functionDir,
}: {
  functionDir: string;
}) {
  /* Copies the required libs for Serverless Functions from .cache to the <name>.func folder */
  await Promise.allSettled(
    [
      {
        src: join('.cache', 'query-engine'),
        dest: join(functionDir, 'lib', 'query-engine'),
      },
      {
        src: join('.cache', 'page-ssr'),
        dest: join(functionDir, 'lib', 'page-ssr'),
      },
      {
        src: join(functionDir, 'lib', 'query-engine', 'assets'),
        dest: join(functionDir, 'assets'),
      },
      {
        src: join('.cache', 'data', 'datastore'),
        dest: join(functionDir, 'assets', 'data', 'datastore'),
      },
      {
        src: join('.cache', 'caches'),
        dest: join(functionDir, 'cache', 'caches'),
      },
    ].map(({ src, dest }) => copy(src, dest))
  );
}

export async function copyHTMLFiles({ functionDir }: { functionDir: string }) {
  /* If available, copies the 404.html and 500.html files to the <name>.func/lib folder */
  for (const htmlFile of ['404', '500']) {
    if (await pathExists(join('public', `${htmlFile}.html`))) {
      try {
        await copyFile(
          join('public', `${htmlFile}.html`),
          join(functionDir, `${htmlFile}.html`)
        );
      } catch (e: any) {
        console.error('Failed to copy HTML files', e.message);
        process.exit(1);
      }
    }
  }
}
