import type { ServerResponse, IncomingMessage } from 'http';
import type { NodeHandler } from '@edge-runtime/node-utils';
import { buildToNodeHandler } from '@edge-runtime/node-utils';
import Edge from '@edge-runtime/primitives';

const webHandlerToNodeHandler = buildToNodeHandler(
  {
    Headers,
    ReadableStream,
    // @ts-expect-error Property 'duplex' is missing in type 'Request'
    Request: class extends Request {
      constructor(input: RequestInfo | URL, init?: RequestInit | undefined) {
        super(input, addDuplexToInit(init));
      }
    },
    Uint8Array,
    FetchEvent: Edge.FetchEvent,
  },
  { defaultOrigin: 'https://vercel.com' }
);

/**
 * When users export at least one HTTP handler, we will generate
 * a generic handler routing to the right method. If there is no
 * handler function exported returns null.
 */
export function getWebExportsHandler(listener: any, methods: string[]) {
  const handlerByMethod: { [key: string]: NodeHandler } = {};

  for (const key of methods) {
    handlerByMethod[key] =
      typeof listener[key] !== 'undefined'
        ? webHandlerToNodeHandler(listener[key])
        : defaultHttpHandler;
  }

  return (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    handlerByMethod[method](req, res);
  };
}

/**
 * Add `duplex: 'half'` by default to all requests
 * https://github.com/vercel/edge-runtime/blob/bf167c418247a79d3941bfce4a5d43c37f512502/packages/primitives/src/primitives/fetch.js#L22-L26
 * https://developer.chrome.com/articles/fetch-streaming-requests/#streaming-request-bodies
 */
function addDuplexToInit(init: RequestInit | undefined) {
  if (typeof init === 'undefined' || typeof init === 'object') {
    return { duplex: 'half', ...init };
  }
  return init;
}

function defaultHttpHandler(_: IncomingMessage, res: ServerResponse) {
  res.statusCode = 405;
  res.end();
}
