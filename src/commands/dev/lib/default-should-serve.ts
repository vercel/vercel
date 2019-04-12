import { parse, basename, extname } from 'path';
// @ts-ignore
import { ShouldServeParams } from '@now/build-utils';

export default function shouldServe({
  entrypoint,
  files,
  requestPath
}: ShouldServeParams): boolean {
  requestPath = requestPath.replace(/\/$/, '');

  if (entrypoint === requestPath) {
    return true;
  }

  if (isIndex(entrypoint)) {
    if (parse(entrypoint).dir === requestPath) {
      return true;
    }
  }

  return false;
}

function isIndex(path: string): boolean {
  const ext = extname(path);
  const name = basename(path, ext);
  return name === 'index';
}
