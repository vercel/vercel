// @ts-expect-error - FIXME: framework build is not exported
import { build as nodeBuild } from '@vercel/node';
import { generateNodeBuilderFunctions } from '@vercel/build-utils';

export const { build, entrypointCallback, findEntrypoint, require_ } =
  generateNodeBuilderFunctions(
    'hono',
    /(?:from|require|import)\s*(?:\(\s*)?["']hono["']\s*(?:\))?/g,
    ['app', 'index', 'server', 'src/app', 'src/index', 'src/server'],
    ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'],
    nodeBuild
  );
