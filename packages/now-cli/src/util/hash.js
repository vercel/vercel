// Native
import { createHash } from 'crypto';

// Packages
import fs from 'fs-extra';

/**
 * Computes hashes for the contents of each file given.
 *
 * @param {Array} of {String} full paths
 * @return {Map}
 */

async function hashes(files) {
  const map = new Map();

  await Promise.all(
    files.map(async name => {
      const data = await fs.readFile(name);

      const h = hash(data);
      const entry = map.get(h);
      if (entry) {
        entry.names.push(name);
      } else {
        map.set(hash(data), { names: [name], data });
      }
    })
  );
  return map;
}

/**
 * Computes a hash for the given buf.
 *
 * @param {Buffer} file data
 * @return {String} hex digest
 */

function hash(buf) {
  return createHash('sha1')
    .update(buf)
    .digest('hex');
}

export default hashes;
