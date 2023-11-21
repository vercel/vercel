import { homedir } from 'node:os';
import { resolve } from 'node:path';

export default function humanizePath(path: string) {
  const resolved = resolve(path);
  const _homedir = homedir();
  return resolved.indexOf(_homedir) === 0
    ? `~${resolved.slice(_homedir.length)}`
    : resolved;
}
