"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.mergeFns = mergeFns;
exports.notImplemented = notImplemented;
exports.rawHeaders = rawHeaders;

function rawHeaders(headers) {
  const rawHeaders2 = [];

  for (const key in headers) {
    if (Array.isArray(headers[key])) {
      for (const h of headers[key]) {
        rawHeaders2.push(key, h);
      }
    } else {
      rawHeaders2.push(key, headers[key]);
    }
  }

  return rawHeaders2;
}

function mergeFns(...functions) {
  return function (...args) {
    for (const fn of functions) {
      fn(...args);
    }
  };
}

function notImplemented(name) {
  return () => {
    throw new Error(`[unenv] ${name} is not implemented yet!`);
  };
}