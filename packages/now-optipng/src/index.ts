// eslint-disable-line import/no-extraneous-dependencies
import {
  FileBlob,
  BuildOptions,
  AnalyzeOptions,
  shouldServe,
} from '@now/build-utils';
import OptiPng from 'optipng';
import pipe from 'multipipe';

export function analyze({ files, entrypoint }: AnalyzeOptions) {
  return files[entrypoint].digest;
}

export async function build({ files, entrypoint }: BuildOptions) {
  const optimizer = new OptiPng(['-o9']);
  const stream = pipe(
    files[entrypoint].toStream(),
    optimizer
  );
  const result = await FileBlob.fromStream({ stream });
  return { [entrypoint]: result };
}

export { shouldServe };
