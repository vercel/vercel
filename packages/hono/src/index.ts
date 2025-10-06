export const version = 3;
import {
  // @ts-expect-error - FIXME: startDevServe types are not exported
  startDevServer as nodeStartDevServer,
  // @ts-expect-error - FIXME: build types are not exported
  build as nodeBuild,
} from '@vercel/node';
import {
  type BuildV3,
  type ShouldServe,
  type StartDevServer,
  prepareBackend,
  entrypointCallback,
} from '@vercel/build-utils';
export {
  build as experimentalBuild,
  version as experimentalVersion,
} from './experimental/build';

const name = 'hono';
const REGEX = /(?:from|require|import)\s*(?:\(\s*)?["']hono["']\s*(?:\))?/g;

export const build: BuildV3 = async args => {
  const { nodeBuilderArgs, framework } = await prepareBackend(
    args,
    name,
    REGEX
  );

  // Express's rendering engine support using the views directory as the entrypoint.
  if (!nodeBuilderArgs.config.includeFiles) {
    nodeBuilderArgs.config.includeFiles = [];
  } else if (typeof nodeBuilderArgs.config.includeFiles === 'string') {
    nodeBuilderArgs.config.includeFiles = [nodeBuilderArgs.config.includeFiles];
  }
  nodeBuilderArgs.config.includeFiles.push('views/**/*');

  const res = await nodeBuild(nodeBuilderArgs);

  res.output.framework = framework;

  return res;
};

export const shouldServe: ShouldServe = async opts => {
  const requestPath = opts.requestPath.replace(/\/$/, ''); // sanitize trailing '/'
  if (requestPath.startsWith('api') && opts.hasMatched) {
    return false;
  }
  return true;
};

export const startDevServer: StartDevServer = async opts => {
  const entrypoint = await entrypointCallback(opts, name, REGEX);

  process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS = '1';
  return nodeStartDevServer({
    ...opts,
    entrypoint,
    publicDir: 'public',
  });
};
