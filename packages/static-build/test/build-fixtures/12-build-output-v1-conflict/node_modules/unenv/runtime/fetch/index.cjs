"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  createFetch: true
};
exports.createFetch = createFetch;

var _call = require("./call");

Object.keys(_call).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _call[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _call[key];
    }
  });
});

function createFetch(call, _fetch = global.fetch) {
  return async function ufetch(input, init) {
    const url = input.toString();

    if (!url.startsWith("/")) {
      return _fetch(url, init);
    }

    try {
      const r = await call({
        url,
        ...init
      });
      return new Response(r.body, {
        status: r.status,
        statusText: r.statusText,
        headers: Object.fromEntries(Object.entries(r.headers).map(([name, value]) => [name, Array.isArray(value) ? value.join(",") : value || ""]))
      });
    } catch (error) {
      return new Response(error.toString(), {
        status: parseInt(error.statusCode || error.code) || 500,
        statusText: error.statusText
      });
    }
  };
}