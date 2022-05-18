import { defineDriver } from "./utils/index.mjs";
import { stringify } from "./utils/index.mjs";
import { $fetch } from "ohmyfetch";
import { joinURL } from "ufo";
export default defineDriver((opts = {}) => {
  const r = (key) => joinURL(opts.base, key.replace(/:/g, "/"));
  return {
    hasItem(key) {
      return $fetch(r(key), { method: "HEAD" }).then(() => true).catch(() => false);
    },
    async getItem(key) {
      const value = await $fetch(r(key));
      return value;
    },
    async getMeta(key) {
      const res = await $fetch.raw(r(key), { method: "HEAD" });
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
      await $fetch(r(key), { method: "PUT", body: stringify(value) });
    },
    async removeItem(key) {
      await $fetch(r(key), { method: "DELETE" });
    },
    async getKeys() {
      const value = await $fetch(r(""));
      return Array.isArray(value) ? value : [];
    },
    clear() {
    }
  };
});
