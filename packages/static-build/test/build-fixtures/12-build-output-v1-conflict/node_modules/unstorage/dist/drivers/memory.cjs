"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
module.exports = void 0;

var _utils = require("./utils");

var _default = (0, _utils.defineDriver)(() => {
  const data = new Map();
  return {
    hasItem(key) {
      return data.has(key);
    },

    getItem(key) {
      return data.get(key) || null;
    },

    setItem(key, value) {
      data.set(key, value);
    },

    removeItem(key) {
      data.delete(key);
    },

    getKeys() {
      return Array.from(data.keys());
    },

    clear() {
      data.clear();
    },

    dispose() {
      data.clear();
    }

  };
});

module.exports = _default;