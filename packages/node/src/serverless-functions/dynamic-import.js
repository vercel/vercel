'use strict';

const { pathToFileURL } = require('url');
const { isAbsolute } = require('path');

function dynamicImport(filepath) {
  const id = isAbsolute(filepath) ? pathToFileURL(filepath).href : filepath;
  return import(id);
}

module.exports = {
  dynamicImport,
};
