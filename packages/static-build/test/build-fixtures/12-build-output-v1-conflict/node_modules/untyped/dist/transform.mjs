import { transform as transform$1 } from '@babel/standalone/babel.min.js';
import babelPluginUntyped from './babel.mjs';
import '@babel/types';
import './chunks/utils.mjs';
import 'scule';

function transform(src) {
  const res = transform$1(src, {
    filename: "src.ts",
    presets: [
      "typescript"
    ],
    plugins: [
      babelPluginUntyped
    ]
  });
  return res.code;
}

export { transform };
