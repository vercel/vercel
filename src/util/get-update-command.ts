import { Stats } from 'fs';
import { dirname, join, resolve } from 'path';
import { readJSON, lstat, readlink } from 'fs-extra';

import { version } from '../../package.json';

// `npm` tacks a bunch of extra properties on the `package.json` file,
// so check for one of them to determine yarn vs. npm.
async function isYarn(): Promise<boolean> {
  let s: Stats;
  let binPath = process.argv[1];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    s = await lstat(binPath);
    if (s.isSymbolicLink()) {
      binPath = resolve(dirname(binPath), await readlink(binPath));
    } else {
      break;
    }
  }
  const pkgPath = join(dirname(binPath), '..', 'package.json');
  const pkg = await readJSON(pkgPath);
  return !('_id' in pkg);
}

export default async function getUpdateCommand(): Promise<string> {
  const tag = version.includes('canary') ? 'canary' : 'latest';

  return (await isYarn())
    ? `yarn global add now@${tag}`
    : `npm install -g now@${tag}`;
}
