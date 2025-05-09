import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';

type WriteheadArgs = {
  statusCode: number;
  headers?: Record<string, string>;
};

// biome-ignore lint/suspicious/noExplicitAny: Not deterministic
export type BodyType = string | Buffer | Record<string, any> | null;

type EventListener = (...args: unknown[]) => void;

/**
 * Anthropic's MCP API requires a server response object. This function
 * creates a fake server response object that can be used to pass to the MCP API.
 */
export function createServerResponseAdapter(
  signal: AbortSignal,
  fn: (re: ServerResponse) => Promise<void> | void
): Promise<Response> {
  let writeHeadResolver: (v: WriteheadArgs) => void;
  const writeHeadPromise = new Promise<WriteheadArgs>(resolve => {
    writeHeadResolver = resolve;
  });

  return new Promise(resolve => {
    let controller: ReadableStreamController<Uint8Array> | undefined;
    let shouldClose = false;
    let wroteHead = false;

    const writeHead = (
      statusCode: number,
      headers?: Record<string, string>
    ) => {
      if (typeof headers === 'string') {
        throw new Error('Status message of writeHead not supported');
      }
      wroteHead = true;
      writeHeadResolver({
        statusCode,
        headers,
      });
      return fakeServerResponse;
    };

    const bufferedData: Uint8Array[] = [];

    const write = (
      chunk: Buffer | string,
      encoding?: BufferEncoding
    ): boolean => {
      if (encoding) {
        throw new Error('Encoding not supported');
      }
      if (chunk instanceof Buffer) {
        throw new Error('Buffer not supported');
      }
      if (!wroteHead) {
        writeHead(200);
      }
      if (!controller) {
        bufferedData.push(new TextEncoder().encode(chunk as string));
        return true;
      }
      controller.enqueue(new TextEncoder().encode(chunk as string));
      return true;
    };

    const eventEmitter = new EventEmitter();

    const fakeServerResponse = {
      writeHead,
      write,
      end: (data?: Buffer | string) => {
        if (data) {
          write(data);
        }

        if (!controller) {
          shouldClose = true;
          return fakeServerResponse;
        }
        try {
          controller.close();
        } catch {
          /* May be closed on tcp layer */
        }
        return fakeServerResponse;
      },
      on: (event: string, listener: EventListener) => {
        eventEmitter.on(event, listener);
        return fakeServerResponse;
      },
    };

    signal.addEventListener('abort', () => {
      eventEmitter.emit('close');
    });

    void fn(fakeServerResponse as ServerResponse);

    void (async () => {
      const head = await writeHeadPromise;

      const response = new Response(
        new ReadableStream({
          start(c) {
            controller = c;
            for (const chunk of bufferedData) {
              controller.enqueue(chunk);
            }
            if (shouldClose) {
              controller.close();
            }
          },
        }),
        {
          status: head.statusCode,
          headers: head.headers,
        }
      );

      resolve(response);
    })();
  });
}
