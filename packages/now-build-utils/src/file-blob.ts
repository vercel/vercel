import assert from 'assert';
import intoStream from 'into-stream';
import { File } from './types';

interface FileBlobOptions {
  mode?: number;
  data: string | Buffer;
}

interface FromStreamOptions {
  mode?: number;
  stream: NodeJS.ReadableStream;
}

export default class FileBlob implements File {
  public type: 'FileBlob';
  public mode: number;
  public data: string | Buffer;

  constructor({ mode = 0o100644, data }: FileBlobOptions) {
    assert(typeof mode === 'number');
    assert(typeof data === 'string' || Buffer.isBuffer(data));
    this.type = 'FileBlob';
    this.mode = mode;
    this.data = data;
  }

  static async fromStream({ mode = 0o100644, stream }: FromStreamOptions) {
    assert(typeof mode === 'number');
    assert(typeof stream.pipe === 'function'); // is-stream
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
      stream.on('error', error => reject(error));
      stream.on('end', () => resolve());
    });

    const data = Buffer.concat(chunks);
    return new FileBlob({ mode, data });
  }

  toStream(): NodeJS.ReadableStream {
    return intoStream(this.data);
  }
}
