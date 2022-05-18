/*!
 * parse-git-config <https://github.com/jonschlinkert/parse-git-config>
 *
 * Copyright (c) 2015-present, Jon Schlinkert.
 * Released under the MIT License.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const ini = require('ini');
const configPath = require('git-config-path');
const expand = str => (str ? str.replace(/^~/, os.homedir()) : '');

/**
 * Asynchronously parse a `.git/config` file. If only the callback is passed,
 * the `.git/config` file relative to `process.cwd()` is used.
 *
 * ```js
 * parse((err, config) => {
 *   if (err) throw err;
 *   // do stuff with config
 * });
 *
 * // or, using async/await
 * (async () => {
 *   console.log(await parse());
 *   console.log(await parse({ cwd: 'foo' }));
 *   console.log(await parse({ cwd: 'foo', path: 'some/.git/config' }));
 * })();
 * ```
 * @name parse
 * @param {Object|String|Function} `options` Options with `cwd` or `path`, the cwd to use, or the callback function.
 * @param {Function} `callback` callback function if the first argument is options or cwd.
 * @return {Object}
 * @api public
 */

const parse = (options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = null;
  }

  if (typeof callback !== 'function') {
    return parse.promise(options);
  }

  return parse.promise(options)
    .then(config => callback(null, config))
    .catch(callback);
};

parse.promise = options => {
  let filepath = parse.resolveConfigPath(options);
  let read = util.promisify(fs.readFile);
  let stat = util.promisify(fs.stat);
  if (!filepath) return Promise.resolve(null);

  return stat(filepath)
    .then(() => read(filepath, 'utf8'))
    .then(str => {
      if (options && options.include === true) {
        str = injectInclude(str, path.resolve(path.dirname(filepath)));
      }
      return parseIni(str, options);
    });
};

/**
 * Synchronously parse a `.git/config` file. If no arguments are passed,
 * the `.git/config` file relative to `process.cwd()` is used.
 *
 * ```js
 * console.log(parse.sync());
 * console.log(parse.sync({ cwd: 'foo' }));
 * console.log(parse.sync({ cwd: 'foo', path: 'some/.git/config' }));
 * ```
 * @name .sync
 * @param {Object|String} `options` Options with `cwd` or `path`, or the cwd to use.
 * @return {Object}
 * @api public
 */

parse.sync = options => {
  let filepath = parse.resolveConfigPath(options);

  if (filepath && fs.existsSync(filepath)) {
    let input = fs.readFileSync(filepath, 'utf8');
    if (options && options.include === true) {
      let cwd = path.resolve(path.dirname(filepath));
      input = injectInclude(input, cwd);
    }
    return parseIni(input, options);
  }

  return {};
};

/**
 * Resolve the git config path
 */

parse.resolveConfigPath = options => {
  if (typeof options === 'string') options = { type: options };
  const opts = Object.assign({ cwd: process.cwd() }, options);
  const fp = opts.path ? expand(opts.path) : configPath(opts.type);
  return fp ? path.resolve(opts.cwd, fp) : null;
};

/**
 * Deprecated: use `.resolveConfigPath` instead
 */

parse.resolve = options => parse.resolveConfigPath(options);

/**
 * Returns an object with only the properties that had ini-style keys
 * converted to objects.
 *
 * ```js
 * const config = parse.sync({ path: '/path/to/.gitconfig' });
 * const obj = parse.expandKeys(config);
 * ```
 * @name .expandKeys
 * @param {Object} `config` The parsed git config object.
 * @return {Object}
 * @api public
 */

parse.expandKeys = config => {
  for (let key of Object.keys(config)) {
    let m = /(\S+) "(.*)"/.exec(key);
    if (!m) continue;
    let prop = m[1];
    config[prop] = config[prop] || {};
    config[prop][m[2]] = config[key];
    delete config[key];
  }
  return config;
};

function parseIni(str, options) {
  let opts = Object.assign({}, options);

  str = str.replace(/\[(\S+) "(.*)"\]/g, (m, $1, $2) => {
    return $1 && $2 ? `[${$1} "${$2.split('.').join('\\.')}"]` : m;
  });

  let config = ini.parse(str);
  if (opts.expandKeys === true) {
    return parse.expandKeys(config);
  }
  return config;
}

function injectInclude(input, cwd) {
  let lines = input.split('\n').filter(line => line.trim() !== '');
  let len = lines.length;
  let res = [];

  for (let i = 0; i < len; i++) {
    let line = lines[i];
    if (line.indexOf('[include]') === 0) {
      let filepath = lines[i + 1].replace(/^\s*path\s*=\s*/, '');
      let fp = path.resolve(cwd, expand(filepath));
      res.push(fs.readFileSync(fp));
    } else {
      res.push(line);
    }
  }
  return res.join('\n');
}

/**
 * Expose `parse`
 */

module.exports = parse;
