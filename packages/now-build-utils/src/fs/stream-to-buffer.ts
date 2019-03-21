import eos from 'end-of-stream';

export default function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const buffers: Buffer[] = [];

    stream.on('data', buffers.push.bind(buffers))

    eos(stream, (err) => {
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