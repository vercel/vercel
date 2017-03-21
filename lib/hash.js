// Native
const { createHash } = require('crypto');
const path = require('path');

// Packages
const { readFile } = require('fs-promise');

/**
  * Computes hashes for the contents of each file given.
  *
  * @param {Array} of {String} full paths
  * @return {Map}
  */

async function hashes(files, isStatic, pkg) {
  const map = new Map();

  await Promise.all(
    files.map(async name => {
      const filename = path.basename(name);
      let data;

      if (isStatic && filename === 'package.json') {
        const packageString = JSON.stringify(pkg, null, 2);
        data = Buffer.from(packageString);
      } else {
        data = await readFile(name);
      }

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
  return createHash('sha1').update(buf).digest('hex');
}

module.exports = hashes;
