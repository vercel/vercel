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

export function streamToBufferChunks(
  stream: NodeJS.ReadableStream,
  mbLimit = 0.001
): Promise<Buffer[]> {
  return new Promise<Buffer[]>((resolve, reject) => {
    const byteLimit = 1024 * 1024 * mbLimit;

    const buffers: Buffer[] = [];

    let currentBuffer: Buffer;
    stream.on('data', (chunk: Buffer) => {
      if (!currentBuffer) {
        currentBuffer = chunk;
      } else if (currentBuffer.length > byteLimit) {
        buffers.push(currentBuffer);
        currentBuffer = chunk;
      } else {
        currentBuffer = Buffer.concat([currentBuffer, chunk]);
      }
    });
    stream.on('end', () => {
      buffers.push(currentBuffer);
    });

    eos(stream, err => {
      if (err) {
        reject(err);
        return;
      }
      resolve(buffers);
    });
  });
}
