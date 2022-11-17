import type { IncomingMessage, ServerResponse } from 'http';
// TODO Typescript has some issue with these :(
/*import type {
  ReadableStream,
  Request,
  Response,
} from '@edge-runtime/primitives';*/
type Response = any;
type ReadableStream = any;
type Request = any;

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;
type WebHandler = (req: Request) => Promise<Response> | Response;

const { Readable } = require('stream');

export function wrapWebHandler(handler: WebHandler): NodeHandler {
  enrichGlobalWithPrimitives();

  return (request: IncomingMessage, response: ServerResponse) => {
    // TODO add the second parameter
    // @ts-ignore TODO map IncompingMessage into Request
    const maybePromise = handler(request);
    const mapResponse = buildResponseMapper(response);
    if (maybePromise instanceof Promise) {
      maybePromise.then(mapResponse);
    } else {
      mapResponse(maybePromise);
    }
  };
}

function buildResponseMapper(serverResponse: ServerResponse) {
  return function (webResponse: Response) {
    if (!webResponse) {
      serverResponse.end();
      return;
    }
    // TODO check for webResponse compliance
    for (const [name, value] of webResponse.headers.entries()) {
      serverResponse.setHeader(name, value);
    }
    serverResponse.statusCode = webResponse.status;
    serverResponse.statusMessage = webResponse.statusText;
    // TODO trailers? https://nodejs.org/api/http.html#responseaddtrailersheaders https://developer.mozilla.org/en-US/docs/Web/API/Response
    if (!webResponse.body) {
      serverResponse.end();
      return;
    }
    buildStreamFromReadableStream(webResponse.body).pipe(serverResponse);
  };
}

/**
 * @see https://github.com/nodejs/node/blob/bd462ad81bc30e547e52e699ee3b6fa3d7c882c9/lib/internal/webstreams/adapters.js#L458
 */
function buildStreamFromReadableStream(readableStream: ReadableStream) {
  const reader = readableStream.getReader();
  let closed = false;

  const readable = new Readable({
    objectMode: false,
    read() {
      reader.read().then(
        (chunk: any) => {
          if (chunk.done) {
            readable.push(null);
          } else {
            readable.push(chunk.value);
          }
        },
        (error: any) => readable.destroy(error)
      );
    },

    destroy(error: any, callback: (arg0: any) => void) {
      function done() {
        try {
          callback(error);
        } catch (error) {
          // In a next tick because this is happening within
          // a promise context, and if there are any errors
          // thrown we don't want those to cause an unhandled
          // rejection. Let's just escape the promise and
          // handle it separately.
          process.nextTick(() => {
            throw error;
          });
        }
      }

      if (!closed) {
        reader.cancel(error).then(done, done);
        return;
      }
      done();
    },
  });

  reader.closed.then(
    () => {
      closed = true;
    },
    (error: any) => {
      closed = true;
      readable.destroy(error);
    }
  );

  return readable;
}

function enrichGlobalWithPrimitives() {
  Object.assign(global, require('@edge-runtime/primitives/abort-controller'));
  Object.assign(global, require('@edge-runtime/primitives/streams'));
  Object.assign(global, require('@edge-runtime/primitives/fetch'));
}
