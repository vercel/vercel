import type { FileDigest } from '../fs/stream-to-digest-async';
import type { Prerender } from '../prerender';
import type { File } from '../types';
import FileBlob from '../file-blob';
import { randomBytes } from 'crypto';
import {
  fileToBuildOutputFile,
  type BuildOutputFile,
} from './file-to-build-output-file';

interface PrerenderToBuildOutputFileResult {
  digest: FileDigest;
  extended: ExtendedPayload;
  file: File;
  output: BuildOutputFile;
}

export async function prerenderToBuildOutputFile(params: {
  buildResult: Prerender;
  outputPath: string;
}): Promise<PrerenderToBuildOutputFileResult | null> {
  const extended = getExtendedPayload(params.buildResult);
  if (!extended.fallback) {
    return null;
  }

  const filePath = params.outputPath + '.fallback';
  const { output, digest } = await fileToBuildOutputFile({
    outputPath: filePath,
    buildResult: extended.fallback,
    extendedBody: extended.extendedBody,
  });

  return {
    file: extended.fallback,
    output,
    digest,
    extended: extended,
  };
}

export interface ExtendedPayload {
  extendedBody: { prefix: string; suffix: string } | undefined;
  fallback?: File | null;
  initialHeaders: Record<string, string> | undefined;
}

const CRLF = '\r\n';
const MULTIPART_HEADER = 'multipart/x-nextjs-extended-payload';
// Keep a single boundary per process to preserve existing callers'
// prerender fallback digests and headers.
const boundary = randomBytes(8).toString('hex');

function getExtendedPayload({
  initialHeaders,
  fallback,
}: Prerender): ExtendedPayload {
  if (!initialHeaders || !Object.entries(initialHeaders).length) {
    return { initialHeaders: undefined, fallback, extendedBody: undefined };
  }

  return {
    initialHeaders: {
      ...(fallback ? {} : { 'x-vercel-empty-fallback': 'true' }),
      'content-type': `${MULTIPART_HEADER}; boundary=${boundary}`,
    },
    fallback: fallback ?? new FileBlob({ data: '' }),
    extendedBody: {
      suffix: `${CRLF}${CRLF}--${boundary}--${CRLF}`,
      prefix:
        [
          `--${boundary}`,
          ...Object.entries(initialHeaders).map(
            ([key, value]) => `${key}: ${value}`
          ),
        ].join(CRLF) +
        CRLF +
        CRLF,
    },
  };
}
