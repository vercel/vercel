"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
module.exports = void 0;

var _utils = require("./utils");

var _default = (0, _utils.defineDriver)((opts = {}) => {
  if (!opts.window) {
    opts.window = typeof window !== "undefined" ? window : void 0;
  }

  if (!opts.localStorage) {
    opts.localStorage = opts.window?.localStorage;
  }

  if (!opts.localStorage) {
    throw new Error("localStorage not available");
  }

  const r = key => (opts.base ? opts.base + ":" : "") + key;

  let _storageListener;

  return {
    hasItem(key) {
      return Object.prototype.hasOwnProperty.call(opts.localStorage, r(key));
    },

    getItem(key) {
      return opts.localStorage.getItem(r(key));
    },

    setItem(key, value) {
      return opts.localStorage.setItem(r(key), value);
    },

    removeItem(key) {
      return opts.localStorage.removeItem(r(key));
    },

    getKeys() {
      return Object.keys(opts.localStorage);
    },

    clear() {
      if (!opts.base) {
        opts.localStorage.clear();
      } else {
        for (const key of Object.keys(opts.localStorage)) {
          opts.localStorage?.removeItem(key);
        }
      }

      if (opts.window && _storageListener) {
        opts.window.removeEventListener("storage", _storageListener);
      }
    },

    watch(callback) {
      if (opts.window) {
        _storageListener = ev => {
          if (ev.key) {
            callback(ev.newValue ? "update" : "remove", ev.key);
          }
        };

        opts.window.addEventListener("storage", _storageListener);
      }
    }

  };
});

module.exports = _default;