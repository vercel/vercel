declare module 'jsonlines' {
  import { Transform } from 'stream';

  function parse(): Transform;
}
