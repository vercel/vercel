import fs from 'fs-promise';
import { createHash } from 'crypto';

/**
 * Computes hashes for the contents of each file given.
 *
 * @param {Array} of {String} full paths
 * @return {Map}
 */

export default async function hashes (files) {
  const entries = await Promise.all(files.map(async (file) => {
    const data = await fs.readFile(file);
    return [file, hash(data)];
  }));
  return new Map(entries);
}

/**
 * Computes a hash for the given buf.
 *
 * @param {Buffer} file data
 * @return {String} hex digest
 */

function hash (buf) {
  return createHash('sha1')
    .update(buf)
    .digest('hex');
}
