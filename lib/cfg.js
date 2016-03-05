import path from 'path';
import fs from 'fs-promise';
import { homedir } from 'os';

const file = path.resolve(homedir(), '.now.json');

export function read () {
  let existing = null;
  try {
    existing = fs.readFileSync(file, 'utf8');
    existing = JSON.parse(existing);
  } catch (err) {}
  return existing || {};
}

/**
 * Merges the `data` object onto the
 * JSON config stored in `.now.json`.
 *
 * (atomic)
 * @param {Object} data
 */

export function merge (data) {
  const cfg = Object.assign({}, read(), data);
  return fs.writeFile(file, JSON.stringify(cfg, null, 2));
}
