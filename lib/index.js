import fs from 'fs-promise';
import getFiles from './get-files';
import hash from './hash';

export default async function now (path, { debug }) {
  try {
    await fs.stat(path);
  } catch (err) {
    throw new Error(`Could not read directory ${path}.`);
  }

  if (debug) console.time('> [debug] Getting files');
  const files = await getFiles(path);
  if (debug) console.timeEnd('> [debug] Getting files');

  if (debug) console.time('> [debug] Computing hashes');
  const hashes = await hash(files);
  if (debug) console.timeEnd('> [debug] Computing hashes');

  if (debug) {
    hashes.forEach((val, key) => {
      console.log(`> [debug] Found "${key}" [${val}]`);
    });
  }

  return 'https://test.now.run';
}
