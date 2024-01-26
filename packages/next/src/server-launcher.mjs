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

const serverStart = performance.now();
const NextServerModule = await import('__NEXT_SERVER_PATH__');
const serverEnd = performance.now();

// eslint-disable-next-line no-undef
const conf = __NEXT_CONFIG__;

const commonStart = performance.now();
// eslint-disable-next-line no-undef
const commonChunks = __COMMON_CHUNKS__;
await Promise.all(commonChunks.map(chunk => import(chunk)));
const commonEnd = performance.now();

// eslint-disable-next-line no-undef
const restChunks = __REST_CHUNKS__;

const createServerStart = performance.now();
const nextServer = new NextServerModule.default.default({
  conf,
  dir: '.',
  minimalMode: true,
  customServer: false,
});
const createServerEnd = performance.now();

// Returns a wrapped handler that will crash the lambda if an error isn't
// caught.
const serve = handler => async (req, res) => {
  try {
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

const createHandlerStart = performance.now();
// The default handler method should be exported as a function on the module.
const defaultExport = serve(nextServer.getRequestHandler());
const createHandlerEnd = performance.now();

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

defaultExport.postload = async () => {
  await Promise.all(restChunks.map(chunk => import(chunk)));
};

performance.measure('vc:import-server', {
  start: serverStart,
  end: serverEnd,
});

performance.measure('vc:import-common', {
  start: commonStart,
  end: commonEnd,
});

performance.measure('vc:create-server', {
  start: createServerStart,
  end: createServerEnd,
});

performance.measure('vc:create-handler', {
  start: createHandlerStart,
  end: createHandlerEnd,
});

export default defaultExport;
