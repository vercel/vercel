'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const unplugin = require('unplugin');
const transform = require('./transform.cjs');
require('acorn');
require('magic-string');
require('estree-walker');

const unctxPlugin = unplugin.createUnplugin((opts = {}) => {
  const transformer = transform.createTransformer(opts);
  return {
    name: "unctx:transfrom",
    enforce: "post",
    transformInclude: opts.transformInclude,
    transform(code, id) {
      const result = transformer.transform(code);
      if (result) {
        return {
          code: result.code,
          map: result.magicString.generateMap({ source: id, includeContent: true })
        };
      }
    }
  };
});

exports.unctxPlugin = unctxPlugin;
