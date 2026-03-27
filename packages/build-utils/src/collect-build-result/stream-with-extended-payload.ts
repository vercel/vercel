import { Readable } from 'stream';

export interface ExtendedBodyData {
  prefix: string;
  suffix: string;
}

export function streamWithExtendedPayload(
  stream: NodeJS.ReadableStream,
  data?: ExtendedBodyData
): NodeJS.ReadableStream {
  return data ? new MultipartContentStream(stream, data) : stream;
}

class MultipartContentStream extends Readable {
  constructor(stream: NodeJS.ReadableStream, data: ExtendedBodyData) {
    super();

    stream.on('error', err => {
      this.emit('error', err);
    });

    stream.on('end', () => {
      this.push(data.suffix);
      this.push(null);
    });

    this.push(data.prefix);

    stream.on('data', chunk => {
      this.push(chunk);
    });
  }

  _read(): void {
    // noop
  }
}
