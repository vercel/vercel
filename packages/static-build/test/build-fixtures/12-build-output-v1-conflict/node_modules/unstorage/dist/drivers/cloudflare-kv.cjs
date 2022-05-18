"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
module.exports = void 0;

var _utils = require("./utils");

var _default = (0, _utils.defineDriver)((opts = {}) => {
  const binding = getBinding(opts.binding);

  async function getKeys(base) {
    const kvList = await binding.list(base);
    return kvList.keys.map(key => key.name);
  }

  return {
    async hasItem(key) {
      return (await binding.get(key)) !== null;
    },

    getItem(key) {
      return binding.get(key);
    },

    setItem(key, value) {
      return binding.put(key, value);
    },

    removeItem(key) {
      return binding.delete(key);
    },

    getKeys,

    async clear() {
      const keys = await getKeys();
      await Promise.all(keys.map(key => binding.delete(key)));
    }

  };
});

module.exports = _default;

function getBinding(binding = "STORAGE") {
  let bindingName = "[binding]";

  if (typeof binding === "string") {
    bindingName = binding;
    binding = globalThis[bindingName];
  }

  if (!binding) {
    throw new Error(`Invalid Cloudflare KV binding '${bindingName}': ${binding}`);
  }

  for (const key of ["get", "put", "delete"]) {
    if (!(key in binding)) {
      throw new Error(`Invalid Cloudflare KV binding '${bindingName}': '${key}' key is missing`);
    }
  }

  return binding;
}