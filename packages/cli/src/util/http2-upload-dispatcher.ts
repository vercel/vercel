import { Agent } from 'undici';

// Uploads run 50 at a time (see `@vercel/client` upload.ts), so a few HTTP/2
// connections can carry all of them without one connection per upload.
const CONNECTIONS = 4;
const STREAMS_PER_CONNECTION = 50;

export function createHttp2UploadDispatcher(): Agent {
  return new Agent({
    allowH2: true,
    connections: CONNECTIONS,
    pipelining: STREAMS_PER_CONNECTION,
  });
}
