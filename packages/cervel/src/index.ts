import { createRequire } from 'module';
import { rolldown } from './rolldown.js';
import { typescript } from './typescript.js';
import { join } from 'path';
import execa from 'execa';
import { findEntrypoint } from './find-entrypoint.js';
import { Colors as c } from './utils.js';
import { ParseArgsOptionsConfig } from 'util';
import { readFile, writeFile } from 'fs/promises';

const require = createRequire(import.meta.url);

// Re-export findEntrypoint for use in other packages
export { findEntrypoint };

export const getBuildSummary = async (outputDir: string) => {
  const buildSummary = await readFile(join(outputDir, '.cervel.json'), 'utf-8');
  return JSON.parse(buildSummary);
};

export const build = async (args: {
  entrypoint?: string;
  cwd: string;
  out: string;
}) => {
  const entrypoint = args.entrypoint || (await findEntrypoint(args.cwd));
  const tsPromise = typescript({
    ...args,
    entrypoint,
    workPath: args.cwd,
  });
  const rolldownResult = await rolldown({
    ...args,
    entrypoint,
    workPath: args.cwd,
    repoRootPath: args.cwd,
    out: args.out,
  });
  await writeFile(
    join(args.cwd, args.out, '.cervel.json'),
    JSON.stringify({ handler: rolldownResult.result.handler }, null, 2)
  );

  console.log(c.gray(`${c.bold(c.cyan('✓'))} Build complete`));

  // Check if typecheck is still running
  const typecheckComplete = true;
  const result = tsPromise
    ? await Promise.race([
        tsPromise.then(() => typecheckComplete),
        Promise.resolve(false),
      ])
    : true;

  if (tsPromise && !result) {
    console.log(c.gray(`${c.bold(c.gray('*'))} Waiting for typecheck...`));
  }

  return { rolldownResult: rolldownResult.result, tsPromise };
};

export const serve = async (args: {
  cwd: string;
  rest: Record<string, string | boolean | undefined>;
}) => {
  const entrypoint = await findEntrypoint(args.cwd);
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
    cwd: args.cwd,
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
