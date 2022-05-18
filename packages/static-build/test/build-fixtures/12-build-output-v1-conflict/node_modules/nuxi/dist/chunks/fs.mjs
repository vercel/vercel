import { promises } from 'node:fs';
import { d as dirname } from './index3.mjs';

async function clearDir(path) {
  await promises.rm(path, { recursive: true, force: true });
  await promises.mkdir(path, { recursive: true });
}
function findup(rootDir, fn) {
  let dir = rootDir;
  while (dir !== dirname(dir)) {
    const res = fn(dir);
    if (res) {
      return res;
    }
    dir = dirname(dir);
  }
  return null;
}

export { clearDir as c, findup as f };
