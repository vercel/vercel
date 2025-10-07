import { rolldown } from './rolldown';
import { typescript } from './typescript';
import { join } from 'path';
import execa from 'execa';
import { findEntrypoint } from './find-entrypoint';

export const build = async (args: {
  entrypoint: string;
  workPath: string;
  repoRootPath: string;
}) => {
  const rolldownResult = await rolldown(args);
  const tsPromise = await typescript(args);
  return { rolldownResult: rolldownResult.result, tsPromise };
};

export const serve = async (args: { cwd: string }) => {
  const entrypoint = await findEntrypoint(args.cwd);
  const srvxPath = require.resolve('srvx');
  const srvxBin = join(srvxPath, '..', '..', '..', 'bin', 'srvx.mjs');
  const tsxBin = require.resolve('tsx');
  const srvxArgs = [srvxBin, '--import', tsxBin, entrypoint];
  await execa('npx', srvxArgs, {
    cwd: args.cwd,
    stdio: 'inherit',
  });
};
