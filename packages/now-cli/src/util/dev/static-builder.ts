import {
  FileFsRef,
  BuildOptions,
  shouldServe as defaultShouldServe,
  ShouldServeOptions,
} from '@vercel/build-utils';
import { BuildResult } from './types';

export const version = 2;

export function build({
  files,
  entrypoint,
  config: { zeroConfig, outputDirectory },
}: BuildOptions): BuildResult {
  let path = entrypoint;

  // Add the output directory prefix
  if (zeroConfig && outputDirectory) {
    path = `${outputDirectory}/${path}`;
  }

  const output = {
    [entrypoint]: files[path] as FileFsRef,
  };
  const watch = [path];

  return { output, routes: [], watch };
}

export function shouldServe(opts: ShouldServeOptions) {
  let {
    entrypoint,
    requestPath,
    config: { zeroConfig, outputDirectory },
  } = opts;

  // Add the output directory prefix
  if (zeroConfig && outputDirectory) {
    entrypoint = `${outputDirectory}/${entrypoint}`;
    requestPath = `${outputDirectory}/${requestPath}`;
  }

  return defaultShouldServe({
    ...opts,
    entrypoint,
    requestPath,
  });
}
