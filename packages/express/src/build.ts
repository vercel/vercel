import { BuildV2, Lambda } from '@vercel/build-utils';
import { downloadInstallAndBundle, maybeExecBuildCommand } from './utils';
import { rolldown } from './rolldown';
import { entrypointCallback } from './find-entrypoint';

export const build: BuildV2 = async args => {
  const downloadResult = await downloadInstallAndBundle(args);

  await maybeExecBuildCommand(args, downloadResult);

  const entrypoint = await entrypointCallback(args);
  args.entrypoint = entrypoint;

  const rolldownResult = await rolldown(args);

  return {
    output: {
      index: new Lambda({
        runtime: 'nodejs22.x',
        ...rolldownResult,
      }),
    },
  };
};
