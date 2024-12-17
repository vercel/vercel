declare module 'jsonlines' {
  import type { Transform } from 'stream';

  function parse(): Transform;
}
