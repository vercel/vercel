import assert from 'assert';
import intoStream from 'into-stream';
import { FileBase } from './types';

interface FileBlobOptions {
  mode?: number;
  contentType?: string;
  data: string | Buffer;
}

interface FromStreamOptions {
  mode?: number;
  contentType?: string;
  stream: NodeJS.ReadableStream;
}

export default class FileBlob implements FileBase {
  public type: 'FileBlob';
  public mode: number;
  public data: string | Buffer;
  public contentType: string | undefined;

  constructor({ mode = 0o100644, contentType, data }: FileBlobOptions) {
    assert(typeof mode === 'number');
    assert(typeof data === 'string' || Buffer.isBuffer(data));
    this.type = 'FileBlob';
    this.mode = mode;
    this.contentType = contentType;
    this.data = data;
  }

  static async fromStream({
    mode = 0o100644,
    contentType,
    stream,
  }: FromStreamOptions) {
    assert(typeof mode === 'number');
    assert(typeof stream.pipe === 'function'); // is-stream
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
      stream.on('error', error => reject(error));
      stream.on('end', () => resolve());
    });

    const data = Buffer.concat(chunks);
    return new FileBlob({ mode, contentType, data });
  }

  async toStreamAsync(): Promise<NodeJS.ReadableStream> {
    return this.toStream();
  }

  toStream(): NodeJS.ReadableStream {
    return intoStream(this.data);
  }
}
