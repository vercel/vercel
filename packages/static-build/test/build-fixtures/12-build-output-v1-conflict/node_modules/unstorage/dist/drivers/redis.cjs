"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
module.exports = void 0;

var _utils = require("./utils");

var _ioredis = _interopRequireDefault(require("ioredis"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _default = (0, _utils.defineDriver)(_opts => {
  const opts = {
    lazyConnect: true,
    ..._opts
  };
  const redis = opts.url ? new _ioredis.default(opts?.url, opts) : new _ioredis.default(opts);
  let base = opts?.base || "";

  if (base && !base.endsWith(":")) {
    base += ":";
  }

  const r = key => base + key;

  return {
    hasItem(key) {
      return redis.exists(r(key)).then(Boolean);
    },

    getItem(key) {
      return redis.get(r(key));
    },

    setItem(key, value) {
      return redis.set(r(key), value).then(() => {});
    },

    removeItem(key) {
      return redis.del(r(key)).then(() => {});
    },

    getKeys() {
      return redis.keys(r("*"));
    },

    async clear() {
      const keys = await this.getKeys();
      return redis.del(keys.map(key => r(key))).then(() => {});
    },

    dispose() {
      return redis.disconnect();
    }

  };
});

module.exports = _default;