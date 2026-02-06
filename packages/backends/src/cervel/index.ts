import { createRequire } from 'node:module';
import { join } from 'node:path';
import { Span } from '@vercel/build-utils';
import execa from 'execa';
import { findEntrypoint, findEntrypointOrThrow } from '../find-entrypoint.js';
import { rolldown } from './rolldown.js';
import { typescript } from './typescript.js';
import { Colors as c } from './utils.js';

export { nodeFileTrace } from './node-file-trace.js';

import type { ParseArgsConfig } from 'node:util';
import type { CervelBuildOptions, CervelServeOptions } from './types.js';

export type {
  CervelBuildOptions,
  CervelServeOptions,
  PathOptions,
} from './types.js';

type ParseArgsOptionsConfig = NonNullable<ParseArgsConfig['options']>;

import { readFile, writeFile } from 'fs/promises';

const require = createRequire(import.meta.url);

// Re-export findEntrypoint for use in other packages
export { findEntrypoint, findEntrypointOrThrow };

export const getBuildSummary = async (outputDir: string) => {
  const buildSummary = await readFile(join(outputDir, '.cervel.json'), 'utf-8');
  return JSON.parse(buildSummary);
};

export const build = async (args: CervelBuildOptions) => {
  const entrypoint =
    args.entrypoint || (await findEntrypointOrThrow(args.workPath));
  const span = args.span ?? new Span({ name: 'cervel-build' });

  // Run TypeScript compilation and rolldown in parallel
  const [, rolldownResult] = await Promise.all([
    typescript({ entrypoint, workPath: args.workPath, span }),
    rolldown({
      entrypoint,
      workPath: args.workPath,
      repoRootPath: args.repoRootPath,
      out: args.out,
      span,
    }),
  ]);

  await writeFile(
    join(args.workPath, args.out, '.cervel.json'),
    JSON.stringify({ handler: rolldownResult.result.handler }, null, 2)
  );

  console.log(c.gray(`${c.bold(c.cyan('✓'))} Build complete`));

  return { rolldownResult: rolldownResult.result };
};

export const serve = async (args: CervelServeOptions) => {
  const entrypoint = await findEntrypointOrThrow(args.workPath);
  const srvxPath = require.resolve('srvx');
  const srvxBin = join(srvxPath, '..', '..', '..', 'bin', 'srvx.mjs');
  const tsxBin = require.resolve('tsx');

  const restArgs = Object.entries(args.rest)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([key, value]) =>
      typeof value === 'boolean' ? `--${key}` : `--${key}=${value}`
    );
  if (!args.rest.import) {
    restArgs.push('--import', tsxBin);
  }
  const srvxArgs = [srvxBin, ...restArgs, entrypoint];
  await execa('npx', srvxArgs, {
    cwd: args.workPath,
    stdio: 'inherit',
  });
};

// Manual copy of srvx options
export const srvxOptions: ParseArgsOptionsConfig = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  prod: { type: 'boolean' },
  port: { type: 'string', short: 'p' },
  host: { type: 'string', short: 'H' },
  static: { type: 'string', short: 's' },
  import: { type: 'string' }, // omitted since we're providing that
  tls: { type: 'boolean' },
  cert: { type: 'string' },
  key: { type: 'string' },
};
