import type { BuildOptions, Files, Span } from '@vercel/build-utils';
import { debug, FileBlob } from '@vercel/build-utils';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);

export const introspection = async (
  args: BuildOptions & { span: Span; files: Files; handler: string }
) => {
  const rolldownEsmLoaderPath = `file://${require.resolve(
    '@vercel/backends/rolldown/esm'
  )}`;
  const rolldownCjsLoaderPath = require.resolve(
    '@vercel/backends/rolldown/cjs-hooks'
  );
  const handlerPath = join(args.workPath, args.entrypoint);
  const files = args.files;
  const tmpDir = mkdtempSync(join(tmpdir(), 'vercel-introspection-'));
  // Only write FileBlob files (built code), not FileFsRef files (traced deps)
  for (const [key, value] of Object.entries(files)) {
    if (!(value instanceof FileBlob) || typeof value.data !== 'string') {
      continue;
    }
    const filePath = join(tmpDir, key);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, value.data);
  }

  await new Promise(resolvePromise => {
    try {
      debug('Spawning introspection process');
      const child = spawn(
        'node',
        [
          '-r',
          rolldownCjsLoaderPath,
          '--import',
          rolldownEsmLoaderPath,
          handlerPath,
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: args.workPath,
          env: {
            ...process.env,
            ...args.meta?.buildEnv,
            ...args.meta?.env,
            VERCEL_INTROSPECTION_HANDLER: handlerPath,
            VERCEL_INTROSPECTION_HANDLER_BUILT: args.handler,
            VERCEL_INTROSPECTION_WORK_PATH: args.workPath,
            VERCEL_INTROSPECTION_REPO_ROOT_PATH: args.repoRootPath,
            VERCEL_INTROSPECTION_TMP_DIR: tmpDir,
          },
        }
      );
      child.stdout?.on('data', data => {
        console.log('stdout', data.toString());
      });
      child.stderr?.on('data', data => {
        console.error('stderr', data.toString());
      });
      child.on('error', error => {
        debug('Introspection spawn error', error);
        resolvePromise(undefined);
      });
      setTimeout(() => {
        child.kill('SIGTERM');
        resolvePromise(undefined);
      }, 1000);
      setTimeout(() => {
        child.kill('SIGKILL');
        resolvePromise(undefined);
      }, 2000);
    } catch (error) {
      debug('Introspection error', error);
      resolvePromise(undefined);
    }
  });
};
