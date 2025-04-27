import { getContext as getVercelRequestContext } from './vercel-request-context';
import { withNextRequestContext } from './next-request-context';
import { toPlainHeaders } from './edge-function-source/to-plain-headers';
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

// __NEXT_CONFIG__ value is injected
declare const __NEXT_CONFIG__: any;
const conf = __NEXT_CONFIG__;

// Next.js expects this to be available on the global same
// as edge runtime
(globalThis as any).AsyncLocalStorage =
  require('async_hooks').AsyncLocalStorage;

const middlewareHandler = require('__NEXT_MIDDLEWARE_PATH__').default;

// Returns a wrapped handler that runs with "@next/request-context"
// and will crash the lambda if an error isn't caught.
const serve = async (request: Request): Promise<Response> => {
  try {
    const context = getVercelRequestContext();
    return await withNextRequestContext(
      { waitUntil: context.waitUntil },
      async () => {
        const result = await middlewareHandler({
          request: {
            url: request.url,
            method: request.method,
            headers: toPlainHeaders(request.headers),
            nextConfig: conf,
            page: '/middleware',
            body:
              request.method !== 'GET' && request.method !== 'HEAD'
                ? request.body
                : undefined,
            waitUntil: context.waitUntil,
          },
        });

        if (result.waitUntil && context.waitUntil) {
          context.waitUntil(result.waitUntil);
        }

        return result.response;
      }
    );
  } catch (err) {
    console.error(err);
    // crash the lambda immediately to clean up any bad module state,
    // this was previously handled in ___vc_bridge on an unhandled rejection
    // but we can do this quicker by triggering here
    process.exit(1);
  }
};

// The default handler method should be exported as a function on the module.
module.exports = serve;
