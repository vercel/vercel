// Native
const { homedir } = require('os');
const path = require('path');

// Packages
const fs = require('fs-promise');

let file = process.env.NOW_JSON
  ? path.resolve(process.env.NOW_JSON)
  : path.resolve(homedir(), '.now.json');

function setConfigFile(nowjson) {
  file = path.resolve(nowjson);
}

function read() {
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

function merge(data) {
  const cfg = Object.assign({}, read(), data);
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
}

module.exports = {
  setConfigFile,
  read,
  merge
};
