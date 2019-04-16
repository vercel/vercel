declare module 'promisepipe' {
  import { ReadableStream, WritableStream } from 'stream'

  export default function (
    stream: ReadableStream,
    anotherStream: WritableStream,
  ): Promise<void>
}
