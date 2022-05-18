import { existsSync, promises as fsp } from "fs";
import { resolve, relative, join } from "path";
import { watch } from "chokidar";
import { defineDriver } from "./utils/index.mjs";
import { readFile, writeFile, readdirRecursive, rmRecursive, unlink } from "./utils/node-fs.mjs";
import anymatch from "anymatch";
export default defineDriver((opts = {}) => {
  if (!opts.base) {
    throw new Error("base is required");
  }
  if (!opts.ignore) {
    opts.ignore = [
      "**/node_modules/**",
      "**/.git/**"
    ];
  }
  opts.base = resolve(opts.base);
  const r = (key) => join(opts.base, key.replace(/:/g, "/"));
  let _watcher;
  return {
    hasItem(key) {
      return existsSync(r(key));
    },
    getItem(key) {
      return readFile(r(key));
    },
    async getMeta(key) {
      const { atime, mtime, size } = await fsp.stat(r(key)).catch(() => ({ atime: void 0, mtime: void 0, size: void 0 }));
      return { atime, mtime, size };
    },
    setItem(key, value) {
      return writeFile(r(key), value);
    },
    removeItem(key) {
      return unlink(r(key));
    },
    getKeys() {
      return readdirRecursive(r("."), anymatch(opts.ignore || []));
    },
    async clear() {
      await rmRecursive(r("."));
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
        _watcher = watch(opts.base, {
          ignoreInitial: true,
          ignored: opts.ignore,
          ...opts.watchOptions
        }).on("ready", resolve2).on("error", reject).on("all", (eventName, path) => {
          path = relative(opts.base, path);
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
