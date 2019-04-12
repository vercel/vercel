import { parse } from 'path';
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

  const { dir, name } = parse(entrypoint);
  if (name === 'index' && dir === requestPath) {
    return true;
  }

  return false;
}
