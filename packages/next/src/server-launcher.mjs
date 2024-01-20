import { fileURLToPath } from 'url';
import { dirname } from 'path';

// The Next.js builder can emit the project in a subdirectory depending on how
// many folder levels of `node_modules` are traced. To ensure `process.cwd()`
// returns the proper path, we change the directory to the folder with the
// launcher. This mimics `yarn workspace run` behavior.
process.chdir(dirname(fileURLToPath(import.meta.url)));

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

const NextServerModule = await import('__NEXT_SERVER_PATH__');

// eslint-disable-next-line no-undef
const conf = __NEXT_CONFIG__;

// eslint-disable-next-line no-undef
const commonChunks = __COMMON_CHUNKS__;
await Promise.all(commonChunks.map(chunk => import(chunk)));

// eslint-disable-next-line no-undef
const restChunks = __REST_CHUNKS__;

const nextServer = new NextServerModule.default.default({
  conf,
  dir: '.',
  minimalMode: true,
  customServer: false,
});

// Returns a wrapped handler that will crash the lambda if an error isn't
// caught.
const serve = handler => async (req, res) => {
  try {
    // eslint-disable-next-line no-undef
    const ctx = globalThis[Symbol.for('@vercel/request-context')];
    ctx.get().waitUntil(() => {
      return Promise.all(restChunks.map(chunk => import(chunk)));
    });

    // @preserve entryDirectory handler
    await handler(req, res);
  } catch (err) {
    console.error(err);
    // crash the lambda immediately to clean up any bad module state,
    // this was previously handled in ___vc_bridge on an unhandled rejection
    // but we can do this quicker by triggering here
    process.exit(1);
  }
};

// The default handler method should be exported as a function on the module.
const defaultExport = serve(nextServer.getRequestHandler());

// If available, add `getRequestHandlerWithMetadata` to the export if it's
// required by the configuration.
if (
  conf.experimental?.ppr &&
  'getRequestHandlerWithMetadata' in nextServer &&
  typeof nextServer.getRequestHandlerWithMetadata === 'function'
) {
  defaultExport.getRequestHandlerWithMetadata = metadata =>
    serve(nextServer.getRequestHandlerWithMetadata(metadata));
}

export default defaultExport;
