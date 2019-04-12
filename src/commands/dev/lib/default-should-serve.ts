import { parse } from 'path';
// @ts-ignore
import { ShouldServeParams } from '@now/build-utils';

export default function shouldServe({
  entrypoint,
  files,
  requestPath
}: ShouldServeParams): boolean {
  requestPath = requestPath.replace(/\/$/, ''); // sanitize trailing '/'
  entrypoint = entrypoint.replace(/\\/, '/'); // windows compatibility

  if (entrypoint === requestPath) {
    return true;
  }

  const { dir, name } = parse(entrypoint);
  if (name === 'index' && dir === requestPath) {
    return true;
  }

  return false;
}
