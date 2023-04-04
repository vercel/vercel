'use strict';

const { pathToFileURL } = require('url');
const { isAbsolute } = require('path');

function dynamicImport(filepath) {
  const id = isAbsolute(filepath) ? pathToFileURL(filepath).href : filepath;
  let fn = import(id).then(mod => mod.default);

  /**
   * In some cases we might have nested default props due to TS => JS
   */
  for (let i = 0; i < 5; i++) {
    if (fn.default) fn = fn.default;
  }

  return fn;
}

module.exports = {
  dynamicImport,
};
