import { parse } from 'path';
import { ShouldServeOptions } from './types';
import FileFsRef from './file-fs-ref';

export default function shouldServe({
  entrypoint,
  files,
  requestPath
}: ShouldServeOptions): boolean {
  requestPath = requestPath.replace(/\/$/, ''); // sanitize trailing '/'
  entrypoint = entrypoint.replace(/\\/, '/'); // windows compatibility

  if (entrypoint === requestPath && hasProp(files, entrypoint)) {
    return true;
  }

  const { dir, name } = parse(entrypoint);
  if (name === 'index' && dir === requestPath && hasProp(files, entrypoint)) {
    return true;
  }

  return false;
}

function hasProp(obj: { [path: string]: FileFsRef }, key: string): boolean {
  return Object.hasOwnProperty.call(obj, key)
}
