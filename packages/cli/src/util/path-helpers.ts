import { normalizePath } from '@vercel/build-utils';
import { relative as nativeRelative } from 'path';

export function relative(a: string, b: string): string {
  return normalizePath(nativeRelative(a, b));
}
