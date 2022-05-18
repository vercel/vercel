"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
module.exports = void 0;

var _fs = require("fs");

var _path = require("path");

var _chokidar = require("chokidar");

var _utils = require("./utils");

var _nodeFs = require("./utils/node-fs");

var _anymatch = _interopRequireDefault(require("anymatch"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _default = (0, _utils.defineDriver)((opts = {}) => {
  if (!opts.base) {
    throw new Error("base is required");
  }

  if (!opts.ignore) {
    opts.ignore = ["**/node_modules/**", "**/.git/**"];
  }

  opts.base = (0, _path.resolve)(opts.base);

  const r = key => (0, _path.join)(opts.base, key.replace(/:/g, "/"));

  let _watcher;

  return {
    hasItem(key) {
      return (0, _fs.existsSync)(r(key));
    },

    getItem(key) {
      return (0, _nodeFs.readFile)(r(key));
    },

    async getMeta(key) {
      const {
        atime,
        mtime,
        size
      } = await _fs.promises.stat(r(key)).catch(() => ({
        atime: void 0,
        mtime: void 0,
        size: void 0
      }));
      return {
        atime,
        mtime,
        size
      };
    },

    setItem(key, value) {
      return (0, _nodeFs.writeFile)(r(key), value);
    },

    removeItem(key) {
      return (0, _nodeFs.unlink)(r(key));
    },

    getKeys() {
      return (0, _nodeFs.readdirRecursive)(r("."), (0, _anymatch.default)(opts.ignore || []));
    },

    async clear() {
      await (0, _nodeFs.rmRecursive)(r("."));
    },

    async dispose() {
      if (_watcher) {
        await _watcher.close();
      }
    },

    watch(callback) {
      if (_watcher) {
        return;
      }

      return new Promise((resolve2, reject) => {
        _watcher = (0, _chokidar.watch)(opts.base, {
          ignoreInitial: true,
          ignored: opts.ignore,
          ...opts.watchOptions
        }).on("ready", resolve2).on("error", reject).on("all", (eventName, path) => {
          path = (0, _path.relative)(opts.base, path);

          if (eventName === "change" || eventName === "add") {
            callback("update", path);
          } else if (eventName === "unlink") {
            callback("remove", path);
          }
        });
      });
    }

  };
});

module.exports = _default;