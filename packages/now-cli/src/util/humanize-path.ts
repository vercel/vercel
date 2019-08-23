import { homedir } from 'os';
import { resolve } from 'path';

export default function humanizePath(path: string) {
  const resolved = resolve(path);
  const _homedir = homedir();
  return resolved.indexOf(_homedir) === 0
    ? `~${resolved.substr(_homedir.length)}`
    : resolved;
}
