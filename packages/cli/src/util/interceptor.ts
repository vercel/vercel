import { WriteStream } from 'tty';

type InterceptReceiver = (data: Buffer) => void;

export function interceptor({
  stdout,
  stderr,
  opts = {
    passthrough: true,
  },
}: {
  stdout: InterceptReceiver;
  stderr: InterceptReceiver;
  opts?: {
    passthrough?: boolean;
  };
}): () => void {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  function injectedWrite(
    stream: WriteStream,
    callback: (data: Buffer) => void
  ) {
    return (
      buffer: Buffer | string,
      encoding?: any,
      cb?: () => void
    ): boolean => {
      const data =
        typeof buffer === 'string' ? Buffer.from(buffer, encoding) : buffer;
      callback(data);

      if (opts.passthrough) {
        return originalStdoutWrite.call(stream, buffer, encoding, cb);
      }
      return true;
    };
  }

  process.stdout.write = injectedWrite(process.stdout, stdout);
  process.stderr.write = injectedWrite(process.stderr, stderr);

  return () => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  };
}
