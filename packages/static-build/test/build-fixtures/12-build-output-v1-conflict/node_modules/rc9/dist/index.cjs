'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const fs = require('fs');
const path = require('path');
const os = require('os');
const destr = require('destr');
const flat = require('flat');
const defu = require('defu');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e["default"] : e; }

const destr__default = /*#__PURE__*/_interopDefaultLegacy(destr);
const flat__default = /*#__PURE__*/_interopDefaultLegacy(flat);
const defu__default = /*#__PURE__*/_interopDefaultLegacy(defu);

const RE_KEY_VAL = /^\s*([^=\s]+)\s*=\s*(.*)?\s*$/;
const RE_LINES = /\n|\r|\r\n/;
const defaults = {
  name: ".conf",
  dir: process.cwd(),
  flat: false
};
function withDefaults(options) {
  if (typeof options === "string") {
    options = { name: options };
  }
  return { ...defaults, ...options };
}
function parse(contents, options = {}) {
  const config = {};
  const lines = contents.split(RE_LINES);
  for (const line of lines) {
    const match = line.match(RE_KEY_VAL);
    if (!match) {
      continue;
    }
    const key = match[1];
    if (!key || key === "__proto__" || key === "constructor") {
      continue;
    }
    const val = destr__default(match[2].trim());
    if (key.endsWith("[]")) {
      const nkey = key.substr(0, key.length - 2);
      config[nkey] = (config[nkey] || []).concat(val);
      continue;
    }
    config[key] = val;
  }
  return options.flat ? config : flat__default.unflatten(config, { overwrite: true });
}
function parseFile(path, options) {
  if (!fs.existsSync(path)) {
    return {};
  }
  return parse(fs.readFileSync(path, "utf-8"), options);
}
function read(options) {
  options = withDefaults(options);
  return parseFile(path.resolve(options.dir, options.name), options);
}
function readUser(options) {
  options = withDefaults(options);
  options.dir = process.env.XDG_CONFIG_HOME || os.homedir();
  return read(options);
}
function serialize(config) {
  return Object.entries(flat__default.flatten(config)).map(([key, val]) => `${key}=${typeof val === "string" ? val : JSON.stringify(val)}`).join("\n");
}
function write(config, options) {
  options = withDefaults(options);
  fs.writeFileSync(path.resolve(options.dir, options.name), serialize(config), {
    encoding: "utf-8"
  });
}
function writeUser(config, options) {
  options = withDefaults(options);
  options.dir = process.env.XDG_CONFIG_HOME || os.homedir();
  write(config, options);
}
function update(config, options) {
  options = withDefaults(options);
  if (!options.flat) {
    config = flat__default.unflatten(config, { overwrite: true });
  }
  const newConfig = defu__default(config, read(options));
  write(newConfig, options);
  return newConfig;
}
function updateUser(config, options) {
  options = withDefaults(options);
  options.dir = process.env.XDG_CONFIG_HOME || os.homedir();
  return update(config, options);
}

exports.defaults = defaults;
exports.parse = parse;
exports.parseFile = parseFile;
exports.read = read;
exports.readUser = readUser;
exports.serialize = serialize;
exports.update = update;
exports.updateUser = updateUser;
exports.write = write;
exports.writeUser = writeUser;
