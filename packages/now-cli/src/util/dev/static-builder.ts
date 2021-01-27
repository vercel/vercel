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
  const path =
    zeroConfig && outputDirectory
      ? `${outputDirectory}/${entrypoint}`
      : entrypoint;
  return {
    output: {
      [entrypoint]: files[path] as FileFsRef,
    },
    routes: [],
    watch: [path],
  };
}

export function shouldServe(_opts: ShouldServeOptions) {
  const opts = { ..._opts };
  let {
    config: { zeroConfig, outputDirectory },
  } = opts;

  // Add the output directory prefix
  if (zeroConfig && outputDirectory) {
    opts.entrypoint = `${outputDirectory}/${opts.entrypoint}`;
    opts.requestPath = `${outputDirectory}/${opts.requestPath}`;
  }

  return defaultShouldServe(opts);
}
