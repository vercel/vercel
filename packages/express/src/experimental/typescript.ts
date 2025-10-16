import { BuildV2, debug } from '@vercel/build-utils';
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { dirname, resolve, extname, join } from 'path';

const require_ = createRequire(__filename);

export const typescript = async (args: Parameters<BuildV2>[0]) => {
  const extension = extname(args.entrypoint);
  const isTypeScript = ['.ts', '.mts', '.cts'].includes(extension);

  if (!isTypeScript) {
    debug('[@vercel/express] Skipping TypeScript check (not a TS file)');
    return;
  }

  const tscPath = resolveTscPath(args);

  return doTypeCheck(args, tscPath);
};

async function doTypeCheck(
  args: Parameters<BuildV2>[0],
  tscPath: string
): Promise<void> {
  const entrypointPath = join(args.workPath, args.entrypoint);

  let stdout = '';
  let stderr = '';

  const tscArgs = [
    tscPath,
    '--noEmit', // Force no emit even if tsconfig says otherwise
    '--pretty',
    '--allowJs',
    '--esModuleInterop',
    '--skipLibCheck',
    entrypointPath,
  ];

  const child = spawn(process.execPath, tscArgs, {
    cwd: args.workPath,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (data: Buffer) => {
    stdout += data.toString();
  });

  child.stderr?.on('data', (data: Buffer) => {
    stderr += data.toString();
  });

  await new Promise<void>((resolve, reject) => {
    child.on('close', code => {
      if (code === 0) {
        debug('[@vercel/express] TypeScript check passed');
        resolve();
      } else {
        debug(`[@vercel/express] TypeScript check failed (exit code: ${code})`);
        const output = stdout || stderr;
        if (output) {
          // Print the TypeScript errors directly
          console.error('\nTypeScript type check failed:\n');
          console.error(output);
        }
        reject(new Error('TypeScript type check failed'));
      }
    });
    child.on('error', err => {
      debug(`[@vercel/express] Error spawning tsc: ${err.message}`);
      reject(err);
    });
  });
}

const resolveTscPath = (args: Parameters<BuildV2>[0]) => {
  try {
    // First try to resolve from user's project
    const pkgPath = require_.resolve('typescript/package.json', {
      paths: [args.workPath],
    });
    const pkg = require_(pkgPath);
    return resolve(dirname(pkgPath), pkg.bin.tsc);
  } catch (e) {
    // Fall back to TypeScript from @vercel/node
    const pkgPath = require_.resolve('typescript/package.json', {
      paths: [require_.resolve('@vercel/node')],
    });
    const pkg = require_(pkgPath);
    return resolve(dirname(pkgPath), pkg.bin.tsc);
  }
};
