import eos from 'end-of-stream';

export default function streamToBuffer(
  stream: NodeJS.ReadableStream
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const buffers: Uint8Array[] = [];

    stream.on('data', chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      buffers.push(Uint8Array.from(buffer));
    });

    eos(stream, err => {
      if (err) {
        reject(err);
        return;
      }
      try {
        switch (buffers.length) {
          case 0:
            resolve(Buffer.allocUnsafe(0));
            break;
          case 1:
            resolve(Buffer.from(buffers[0]));
            break;
          default:
            resolve(Buffer.concat(buffers));
        }
      } catch (concatErr) {
        reject(concatErr);
      }
    });
  });
}

const MB = 1024 * 1024;

export async function streamToBufferChunks(
  stream: NodeJS.ReadableStream,
  chunkSize: number = 100 * MB
): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  let currentChunk: Uint8Array[] = [];
  let currentSize = 0;

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let offset = 0;

    while (offset < buffer.length) {
      const remainingSpace = chunkSize - currentSize;
      const sliceSize = Math.min(remainingSpace, buffer.length - offset);

      currentChunk.push(
        Uint8Array.from(buffer.subarray(offset, offset + sliceSize))
      );
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
