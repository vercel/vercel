import { homedir } from 'os';
import { resolve } from 'path';

export default function humanizePath(path: string) {
  const resolved = resolve(path);
  const _homedir = homedir();
  return resolved.startsWith(_homedir)
    ? `~${resolved.slice(_homedir.length)}`
    : resolved;
}
