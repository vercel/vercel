import type { BuildDependencies } from '@edge-runtime/node-utils';
import { buildToNodeHandler } from '@edge-runtime/node-utils';

export function transformToNodeHandler(webHandler: any) {
  const toNodeHandler = buildToNodeHandler(
    {
      Headers: globalThis.Headers as BuildDependencies['Headers'],
      ReadableStream: globalThis.ReadableStream,
      Request: globalThis.Request as BuildDependencies['Request'],
      Uint8Array: globalThis.Uint8Array,
      FetchEvent,
    },
    { defaultOrigin: 'https://vercel.com' }
  );
  return toNodeHandler(webHandler);
}

class FetchEvent extends Event {
  public request: Request;
  public awaiting: Set<Promise<void>>;

  constructor(request: Request) {
    super('fetch');
    this.request = request;
    this.awaiting = new Set<Promise<void>>();
  }
}
