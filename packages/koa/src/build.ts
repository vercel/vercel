// @ts-expect-error - FIXME: framework build is not exported
import { build as nodeBuild } from '@vercel/node';
import { generateNodeBuilderFunctions } from '@vercel/build-utils';

export const { build, entrypointCallback, findEntrypoint, require_ } =
  generateNodeBuilderFunctions(
    'koa',
    /(?:from|require|import)\s*(?:\(\s*)?["']koa["']\s*(?:\))?/g,
    ['app', 'index', 'server', 'src/app', 'src/index', 'src/server'],
    ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'],
    nodeBuild
  );
