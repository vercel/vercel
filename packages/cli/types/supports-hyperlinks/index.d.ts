declare module 'supports-hyperlinks' {
  import { Writable } from 'stream';
  export function supportsHyperlink(stream: Writable): boolean;
}
