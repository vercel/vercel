import { Readable } from 'stream'

export function bufferToReadable(buffer: Buffer): Readable {
  const readable = new Readable();
  readable._read = () => {}; // `_read()` is required, but you can noop it
  readable.push(buffer);
  readable.push(null);
  return readable;
}

export function readableToBuffer(readable: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    readable.on('data', (chunk) => {
      size += chunk.length;
      chunks.push(chunk);
    });
    readable.on('end', () => {
      resolve(Buffer.concat(chunks, size));
    });
    readable.on('error', reject);
  });
}
