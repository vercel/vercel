import { relative as nativeRelative } from 'path';

const isWin = process.platform === 'win32';

export function relative(a: string, b: string): string {
  let p = nativeRelative(a, b);
  if (isWin) {
    p = p.replace(/\\/g, '/');
  }
  return p;
}
