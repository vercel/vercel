import { basename, extname, join } from 'path';
import { FileFsRef, BuildOptions, ShouldServeOptions } from '@now/build-utils';
import { BuildResult } from './types';

export const version = 2;

export function build({
  files,
  entrypoint,
  config,
}: BuildOptions): BuildResult {
  let path = entrypoint;
  const outputDir = config.zeroConfig ? config.outputDirectory : '';
  const outputMatch = outputDir + '/';
  if (outputDir && path.startsWith(outputMatch)) {
    // static output files are moved to the root directory
    path = path.slice(outputMatch.length);
  }
  const output = {
    [path]: files[entrypoint] as FileFsRef,
  };
  const watch = [path];

  return { output, routes: [], watch };
}

export function shouldServe({
  entrypoint,
  files,
  requestPath,
  config = {},
}: ShouldServeOptions) {
  let outputPrefix = '';
  const outputDir = config.zeroConfig ? config.outputDirectory : '';
  const outputMatch = outputDir + '/';
  if (outputDir && entrypoint.startsWith(outputMatch)) {
    // static output files are moved to the root directory
    entrypoint = entrypoint.slice(outputMatch.length);
    outputPrefix = outputMatch;
  }
  const isMatch = (f: string) => entrypoint === f && outputPrefix + f in files;

  if (isIndex(entrypoint)) {
    const indexPath = join(requestPath, basename(entrypoint));
    if (isMatch(indexPath)) {
      return true;
    }
  }
  return isMatch(requestPath);
}

function isIndex(path: string): boolean {
  const ext = extname(path);
  const name = basename(path, ext);
  return name === 'index';
}
