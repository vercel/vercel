import type { Files } from '../types';
import { init as initCjs, parse as parseCjs } from 'cjs-module-lexer';
import { init as initEsm, parse as parseEsm } from 'es-module-lexer';

interface LambdaLike {
  files?: Files;
  handler: string;
  launcherType?: string;
  runtime: string;
  supportsResponseStreaming?: boolean;
}

export interface SupportsStreamingResult {
  supportsStreaming: boolean | undefined;
  error?: { handler: string; message: string };
}

/**
 * Determines if a Lambda should have streaming enabled. If
 * `forceStreamingRuntime` is true, streaming is always enabled. If the
 * setting is defined it will be honored. For Node.js it checks the handler
 * exports which is why it needs to be asynchronous.
 */
export async function getLambdaSupportsStreaming(
  lambda: LambdaLike,
  forceStreamingRuntime: boolean
): Promise<SupportsStreamingResult> {
  if (forceStreamingRuntime) {
    return { supportsStreaming: true };
  }

  if (typeof lambda.supportsResponseStreaming === 'boolean') {
    return { supportsStreaming: lambda.supportsResponseStreaming };
  }

  if ('launcherType' in lambda && lambda.launcherType === 'Nodejs') {
    return lambdaShouldStream(lambda);
  }

  return { supportsStreaming: undefined };
}

/* https://nextjs.org/docs/app/building-your-application/routing/router-handlers#supported-http-methods */
const HTTP_METHODS = [
  'GET',
  'HEAD',
  'OPTIONS',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
];

/**
 * Determines if a Lambda should have streaming enabled by default by checking
 * its handler exports. When using Web Handlers (contains named exports after
 * HTTP methods), it should be enabled.
 *
 * It works for both ESM and CJS modules. In case of a parsing error it will
 * simply not opt-in so that we keep the same behavior as before where we
 * fail on runtime.
 */
async function lambdaShouldStream(
  lambda: LambdaLike
): Promise<SupportsStreamingResult> {
  const stream = lambda.files?.[lambda.handler]?.toStream();
  if (!stream) {
    return { supportsStreaming: undefined };
  }

  try {
    const buffer = await streamToBuffer(stream);
    const names = await getFileExports(lambda.handler, buffer.toString('utf8'));
    for (const name of names) {
      if (HTTP_METHODS.includes(name)) {
        return { supportsStreaming: true };
      }
    }
  } catch (err) {
    return {
      supportsStreaming: undefined,
      error: { handler: lambda.handler, message: String(err) },
    };
  }

  return { supportsStreaming: undefined };
}

async function getFileExports(
  filename: string,
  content: string
): Promise<string[]> {
  if (filename.endsWith('.mjs')) {
    await initEsm;
    return parseEsm(content)[1].map(specifier => specifier.n);
  }

  // Assume CJS by default, but fallback to ESM as the file might end with `.js`
  // but still be ESM (e.g. `package.json` specifying `"type": "module"`).
  try {
    await initCjs();
    return parseCjs(content).exports;
  } catch {
    await initEsm;
    return parseEsm(content)[1].map(specifier => specifier.n);
  }
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const buffers: Buffer[] = [];
    stream.on('error', (err: Error) => {
      reject(err);
    });
    stream.on('data', (buffer: Buffer) => {
      buffers.push(buffer);
    });
    stream.on('end', () => {
      resolve(Buffer.concat(buffers));
    });
  });
}
