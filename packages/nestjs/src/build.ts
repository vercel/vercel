// @ts-expect-error - FIXME: framework build is not exported
import { build as nodeBuild } from '@vercel/node';
import { generateNodeBuilderFunctions } from '@vercel/build-utils';

export const { build, entrypointCallback, findEntrypoint, require_ } =
  generateNodeBuilderFunctions(
    'nestjs',
    /(?:from|require|import)\s*(?:\(\s*)?["']@nestjs\/core["']\s*(?:\))?/g,
    [
      'src/main',
      'src/app',
      'src/index',
      'src/server',
      'main',
      'app',
      'index',
      'server',
    ],
    ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'],
    nodeBuild
  );
