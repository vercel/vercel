declare module 'stream-to-promise' {
  import { Stream } from 'stream';
  export default function streamToPromise(
    stream: NodeJS.ReadableStream
  ): Promise<string>;
}
