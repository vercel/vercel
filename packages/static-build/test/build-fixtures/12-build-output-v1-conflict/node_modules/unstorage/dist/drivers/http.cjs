"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
module.exports = void 0;

var _utils = require("./utils");

var _ohmyfetch = require("ohmyfetch");

var _ufo = require("ufo");

var _default = (0, _utils.defineDriver)((opts = {}) => {
  const r = key => (0, _ufo.joinURL)(opts.base, key.replace(/:/g, "/"));

  return {
    hasItem(key) {
      return (0, _ohmyfetch.$fetch)(r(key), {
        method: "HEAD"
      }).then(() => true).catch(() => false);
    },

    async getItem(key) {
      const value = await (0, _ohmyfetch.$fetch)(r(key));
      return value;
    },

    async getMeta(key) {
      const res = await _ohmyfetch.$fetch.raw(r(key), {
        method: "HEAD"
      });
      let mtime = void 0;

      const _lastModified = res.headers.get("last-modified");

      if (_lastModified) {
        mtime = new Date(_lastModified);
      }

      return {
        status: res.status,
        mtime
      };
    },

    async setItem(key, value) {
      await (0, _ohmyfetch.$fetch)(r(key), {
        method: "PUT",
        body: (0, _utils.stringify)(value)
      });
    },

    async removeItem(key) {
      await (0, _ohmyfetch.$fetch)(r(key), {
        method: "DELETE"
      });
    },

    async getKeys() {
      const value = await (0, _ohmyfetch.$fetch)(r(""));
      return Array.isArray(value) ? value : [];
    },

    clear() {}

  };
});

module.exports = _default;