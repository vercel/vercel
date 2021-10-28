import globby from 'globby';
import { extname, join } from 'path';
import * as esbuild from 'esbuild';
import { promises as fsp } from 'fs';
import { IncomingMessage } from 'http';

const SUPPORTED_EXTENSIONS = ['.js', '.ts'];

// File name of the `entries.js` file that gets copied into the
// project directory. Use a name that is unlikely to conflict.
const ENTRIES_NAME = '___vc_entries.js';

async function getMiddlewareFile() {
  // Only the root-level `_middleware.*` files are considered.
  // For more granular routing, the Project's Framework (i.e. Next.js)
  // middleware support should be used.
  const middlewareFiles = await globby('_middleware.*');

  if (middlewareFiles.length === 0) {
    // No middleware file at the root of the project, so bail...
    return;
  }

  if (middlewareFiles.length > 1) {
    throw new Error(
      `Only one middleware file is allowed. Found: ${middlewareFiles.join(
        ', '
      )}`
    );
  }

  const ext = extname(middlewareFiles[0]);
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  return middlewareFiles[0];
}

export async function build() {
  const middlewareFile = await getMiddlewareFile();
  if (!middlewareFile) return;

  console.log('Compiling middleware file: %j', middlewareFile);

  // Create `_ENTRIES` wrapper
  await fsp.copyFile(join(__dirname, 'entries.js'), ENTRIES_NAME);

  // Build
  try {
    await esbuild.build({
      entryPoints: [ENTRIES_NAME],
      bundle: true,
      absWorkingDir: process.cwd(),
      outfile: '.output/server/pages/_middleware.js',
    });
  } finally {
    await fsp.unlink(ENTRIES_NAME);
  }

  // Write middleware manifest
  const middlewareManifest = {
    version: 1,
    sortedMiddleware: ['/'],
    middleware: {
      '/': {
        env: [],
        files: ['server/pages/_middleware.js'],
        name: 'pages/_middleware',
        page: '/',
        regexp: '^/.*$',
      },
    },
  };
  const middlewareManifestData = JSON.stringify(middlewareManifest, null, 2);
  const middlewareManifestPath = '.output/server/middleware-manifest.json';
  await fsp.writeFile(middlewareManifestPath, middlewareManifestData);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function runDevMiddleware(req: IncomingMessage) {
  // Should run the middleware in the `vm` sandbox and return the result
  // back to `vercel dev`. If no middleware file exists then this function
  // should return `finished: false` (very quickly, since this is being
  // invoked for every HTTP request!).
}
