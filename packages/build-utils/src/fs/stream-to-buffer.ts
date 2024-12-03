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

export async function streamToBufferChunks(
  stream: NodeJS.ReadableStream,
  mbLimit = 100
) {
  const byteLimit = 1024 * 1024 * mbLimit;

  const buffers: Buffer[] = [];

  let currentBuffer: Buffer | null = null;

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (!currentBuffer) {
      currentBuffer = buffer;
    } else if (currentBuffer.length > byteLimit) {
      buffers.push(currentBuffer);
      currentBuffer = buffer;
    } else {
      currentBuffer = Buffer.concat([currentBuffer, buffer]);
    }
  }
  if (Buffer.isBuffer(currentBuffer)) {
    buffers.push(currentBuffer);
  }

  return buffers;
}
