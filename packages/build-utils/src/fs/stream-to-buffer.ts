import eos from 'end-of-stream';

export default function streamToBuffer(
  stream: NodeJS.ReadableStream
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const buffers: Buffer[] = [];

    stream.on('data', buffers.push.bind(buffers));

    eos(stream, err => {
      if (err) {
        reject(err);
        return;
      }
      switch (buffers.length) {
        case 0:
          resolve(Buffer.allocUnsafe(0));
          break;
        case 1:
          resolve(buffers[0]);
          break;
        default:
          resolve(Buffer.concat(buffers));
      }
    });
  });
}

const MB = 1024 * 1024;

export async function streamToBufferChunks(
  stream: NodeJS.ReadableStream,
  chunkSize: number = 20 * MB
): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  let currentChunk: Buffer[] = [];
  let currentSize = 0;

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let offset = 0;

    while (offset < buffer.length) {
      const remainingSpace = chunkSize - currentSize;
      const sliceSize = Math.min(remainingSpace, buffer.length - offset);

      currentChunk.push(buffer.slice(offset, offset + sliceSize));
      currentSize += sliceSize;
      offset += sliceSize;

      if (currentSize >= chunkSize) {
        chunks.push(Buffer.concat(currentChunk));
        currentChunk = [];
        currentSize = 0;
      }
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(Buffer.concat(currentChunk));
  }

  return chunks;
}
