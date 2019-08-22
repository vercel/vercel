import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirp } from 'fs-extra';

export default async function getWritableDirectory() {
  const name = Math.floor(Math.random() * 0x7fffffff).toString(16);
  const directory = join(tmpdir(), name);
  await mkdirp(directory);
  return directory;
}
