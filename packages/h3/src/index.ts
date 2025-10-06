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

const name = 'h3';
const REGEX = /(?:from|require|import)\s*(?:\(\s*)?["']h3["']\s*(?:\))?/g;

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
    // Don't override API routes, otherwise serve it
    return false;
  }
  // NOTE: public assets are served by the default handler
  return true;
};

/**
 * The dev server works essentially the same as the build command, it creates
 * a shim file, but it places it in a gitignored location so as to not pollute
 * the users git index. For this reason, the shim's import statement will
 * need to be relative to the shim's location.
 */
export const startDevServer: StartDevServer = async opts => {
  const entrypoint = await entrypointCallback(opts, name, REGEX);

  process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS = '1';
  return nodeStartDevServer({
    ...opts,
    entrypoint,
    publicDir: 'public',
  });
};
