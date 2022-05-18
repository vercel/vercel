"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
module.exports = void 0;

function getGlobal() {
  if (typeof globalThis !== "undefined") {
    return globalThis;
  }

  if (typeof self !== "undefined") {
    return self;
  }

  if (typeof window !== "undefined") {
    return window;
  }

  if (typeof global !== "undefined") {
    return global;
  }

  return {};
}

var _default = getGlobal();

module.exports = _default;