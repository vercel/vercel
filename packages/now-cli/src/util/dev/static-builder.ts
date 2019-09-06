import { basename, extname, join } from 'path';
import { BuilderParams, BuildResult, ShouldServeParams } from './types';

export const version = 2;

export function build({ files, entrypoint }: BuilderParams): BuildResult {
  const output = {
    [entrypoint]: files[entrypoint],
  };
  const watch = [entrypoint];

  return { output, routes: [], watch };
}

export function shouldServe({
  entrypoint,
  files,
  requestPath,
}: ShouldServeParams) {
  if (isIndex(entrypoint)) {
    const indexPath = join(requestPath, basename(entrypoint));
    if (entrypoint === indexPath && indexPath in files) {
      return true;
    }
  }
  return entrypoint === requestPath && requestPath in files;
}

function isIndex(path: string): boolean {
  const ext = extname(path);
  const name = basename(path, ext);
  return name === 'index';
}
