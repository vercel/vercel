import { IncomingMessage, ServerResponse } from 'http';
import { getContext as getVercelRequestContext } from './vercel-request-context';
import { withNextRequestContext } from './next-request-context';
// The Next.js builder can emit the project in a subdirectory depending on how
// many folder levels of `node_modules` are traced. To ensure `process.cwd()`
// returns the proper path, we change the directory to the folder with the
// launcher. This mimics `yarn workspace run` behavior.
process.chdir(__dirname);

const region = process.env.VERCEL_REGION || process.env.NOW_REGION;

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = region === 'dev1' ? 'development' : 'production';
}

if (process.env.NODE_ENV !== 'production' && region !== 'dev1') {
  console.warn(
    `Warning: NODE_ENV was incorrectly set to "${process.env.NODE_ENV}", this value is being overridden to "production"`
  );
  process.env.NODE_ENV = 'production';
}

// @preserve pre-next-server-target

// eslint-disable-next-line
const NextServer = require('__NEXT_SERVER_PATH__').default;

// @preserve next-server-preload-target

// __NEXT_CONFIG__ value is injected
declare const __NEXT_CONFIG__: any;
const conf = __NEXT_CONFIG__;

const nextServer = new NextServer({
  conf,
  dir: '.',
  minimalMode: true,
  customServer: false,
});

// Returns a wrapped handler that runs with "@next/request-context"
// and will crash the lambda if an error isn't caught.
const serve =
  (handler: any) => async (req: IncomingMessage, res: ServerResponse) => {
    const vercelContext = getVercelRequestContext();
    await withNextRequestContext({ waitUntil: vercelContext.waitUntil }, () => {
      // @preserve entryDirectory handler
      return handler(req, res);
    });
  };

// The default handler method should be exported as a function on the module.
module.exports = serve(nextServer.getRequestHandler());

// If available, add `getRequestHandlerWithMetadata` to the export if it's
// required by the configuration.
if (
  (conf.experimental?.ppr || conf.experimental?.cacheComponents) &&
  'getRequestHandlerWithMetadata' in nextServer &&
  typeof nextServer.getRequestHandlerWithMetadata === 'function'
) {
  module.exports.getRequestHandlerWithMetadata = (metadata: any) =>
    serve(nextServer.getRequestHandlerWithMetadata(metadata));
}

if (process.env.NEXT_PRIVATE_PRELOAD_ENTRIES) {
  module.exports.preload = nextServer.unstable_preloadEntries.bind(nextServer);
}
