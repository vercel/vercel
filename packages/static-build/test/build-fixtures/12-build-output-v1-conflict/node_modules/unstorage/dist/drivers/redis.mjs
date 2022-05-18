import { defineDriver } from "./utils/index.mjs";
import Redis from "ioredis";
export default defineDriver((_opts) => {
  const opts = { lazyConnect: true, ..._opts };
  const redis = opts.url ? new Redis(opts?.url, opts) : new Redis(opts);
  let base = opts?.base || "";
  if (base && !base.endsWith(":")) {
    base += ":";
  }
  const r = (key) => base + key;
  return {
    hasItem(key) {
      return redis.exists(r(key)).then(Boolean);
    },
    getItem(key) {
      return redis.get(r(key));
    },
    setItem(key, value) {
      return redis.set(r(key), value).then(() => {
      });
    },
    removeItem(key) {
      return redis.del(r(key)).then(() => {
      });
    },
    getKeys() {
      return redis.keys(r("*"));
    },
    async clear() {
      const keys = await this.getKeys();
      return redis.del(keys.map((key) => r(key))).then(() => {
      });
    },
    dispose() {
      return redis.disconnect();
    }
  };
});
