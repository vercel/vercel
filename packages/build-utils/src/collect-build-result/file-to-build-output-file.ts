import type { FileDigest } from '../fs/stream-to-digest-async';
import type FileFsRef from '../file-fs-ref';
import type FileRef from '../file-ref';
import type FileBlob from '../file-blob';
import { streamToDigestAsync } from '../fs/stream-to-digest-async';
import { streamWithExtendedPayload } from './stream-with-extended-payload';
import { validateRegularFile } from './validate-regular-file';
import { getContentType } from './get-content-type';

export interface BuildOutputFile {
  contentType?: string;
  digest: string;
  lambda: null;
  mode: number;
  path: string;
  paths?: string[];
  size?: number;
  type?: 'file';
  prerenderPath?: string;
}

export async function fileToBuildOutputFile(params: {
  buildResult: FileBlob | FileFsRef | FileRef;
  extendedBody?: { prefix: string; suffix: string };
  outputPath: string;
}): Promise<{
  output: BuildOutputFile;
  digest: FileDigest;
}> {
  await validateRegularFile(params.buildResult);

  const digest = await streamToDigestAsync(
    streamWithExtendedPayload(
      params.buildResult.toStreamAsync
        ? await params.buildResult.toStreamAsync()
        : params.buildResult.toStream(),
      params.extendedBody
    )
  );

  const contentType = params.buildResult.contentType
    ? params.buildResult.contentType
    : 'fsPath' in params.buildResult
      ? getContentType(params.buildResult.fsPath)
      : undefined;

  return {
    digest,
    output: {
      type: 'file',
      path: params.outputPath,
      prerenderPath: (params.buildResult as { prerenderPath?: string })
        .prerenderPath,
      digest: digest.sha256,
      mode: params.buildResult.mode,
      contentType: contentType,
      size: digest.size,
      lambda: null,
    },
  };
}
