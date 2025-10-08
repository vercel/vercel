import { createRequire } from 'module';
import { spawn } from 'child_process';
import { extname, join } from 'path';
import { Colors as c } from './utils.js';

const require_ = createRequire(import.meta.url);

export const typescript = async (args: {
  entrypoint: string;
  workPath: string;
}) => {
  const extension = extname(args.entrypoint);
  const isTypeScript = ['.ts', '.mts', '.cts'].includes(extension);

  if (!isTypeScript) {
    return;
  }

  const tscPath = resolveTscPath(args);
  if (!tscPath) {
    console.log(
      c.gray(
        `${c.bold(c.cyan('✓'))} Typecheck skipped ${c.gray(
          '(TypeScript not found)'
        )}`
      )
    );
    return Promise.resolve();
  }

  return doTypeCheck(args, tscPath);
};

async function doTypeCheck(
  args: { entrypoint: string; workPath: string },
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
        console.log(c.gray(`${c.bold(c.cyan('✓'))} Typecheck complete`));
        resolve();
      } else {
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
      reject(err);
    });
  });
}

const resolveTscPath = (args: { entrypoint: string; workPath: string }) => {
  try {
    const pkgPath = require_.resolve('typescript/bin/tsc', {
      paths: [args.workPath],
    });
    return pkgPath;
  } catch (e) {
    return null;
  }
};
