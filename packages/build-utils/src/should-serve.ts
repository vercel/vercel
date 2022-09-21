import { parse } from 'path';
import { normalizePath } from './fs/normalize-path';
import type FileFsRef from './file-fs-ref';
import type { ShouldServe } from './types';

export const shouldServe: ShouldServe = ({
  entrypoint,
  files,
  requestPath,
}) => {
  const normalizedRequestPath = requestPath.replace(/\/$/, ''); // sanitize trailing '/'
  const normalizedEntrypoint = normalizePath(entrypoint);

  if (
    normalizedEntrypoint === normalizedRequestPath &&
    hasProp(files, normalizedEntrypoint)
  ) {
    return true;
  }

  const { dir, name } = parse(normalizedEntrypoint);
  if (
    name === 'index' &&
    dir === normalizedRequestPath &&
    hasProp(files, normalizedEntrypoint)
  ) {
    return true;
  }

  return false;
};

function hasProp(obj: Record<string, FileFsRef>, key: string): boolean {
  return Object.hasOwnProperty.call(obj, key);
}
