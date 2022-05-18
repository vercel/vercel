'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const babel_min_js = require('@babel/standalone/babel.min.js');
const babel = require('./babel.cjs');
require('@babel/types');
require('./chunks/utils.cjs');
require('scule');

function transform(src) {
  const res = babel_min_js.transform(src, {
    filename: "src.ts",
    presets: [
      "typescript"
    ],
    plugins: [
      babel
    ]
  });
  return res.code;
}

exports.transform = transform;
