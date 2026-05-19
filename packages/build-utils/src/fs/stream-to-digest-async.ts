import { createHash } from 'crypto';

export interface FileDigest {
  md5: string;
  sha256: string;
  size: number;
}

export async function streamToDigestAsync(
  stream: NodeJS.ReadableStream
): Promise<FileDigest> {
  return await new Promise((resolve, reject) => {
    stream.once('error', reject);

    let count = 0;
    const sha256 = createHash('sha256');
    const md5 = createHash('md5');

    stream.on('end', () => {
      const res = {
        sha256: sha256.digest('hex'),
        md5: md5.digest('hex'),
        size: count,
      };
      resolve(res);
    });

    // listening the `readable` event and calling stream.read()
    // is slightly faster than using a callback on the `data` event
    // for large files
    stream.on('readable', () => {
      let chunk: any;
      while (null !== (chunk = stream.read())) {
        const buffer = Buffer.isBuffer(chunk)
          ? Uint8Array.from(chunk)
          : Uint8Array.from(Buffer.from(chunk));
        md5.update(buffer);
        sha256.update(buffer);
        count += chunk.length;
      }
    });
  });
}

export function sha256(value: any) {
  return createHash('sha256').update(value).digest('hex');
}

export function md5(value: Buffer) {
  return createHash('md5').update(Uint8Array.from(value)).digest('hex');
}
