"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var node_handler_exports = {};
__export(node_handler_exports, {
  getHandlerSource: () => getHandlerSource
});
module.exports = __toCommonJS(node_handler_exports);
const getHandlerSource = (ctx) => `
  require('next/dist/server/node-environment');
  require('next/dist/server/node-polyfill-crypto');
  
  try {
    // this can fail to install if styled-jsx is not discoverable
    // but this is tolerable as the require-hook is handling edge cases
    require('next/dist/server/require-hook');
  } catch (_) {}
  
  process.chdir(__dirname);
  
  module.exports = (${(() => {
  const path = require("path");
  const relativeDistDir = process.env.__PRIVATE_RELATIVE_DIST_DIR;
  const prerenderFallbackFalseMap = process.env.__PRIVATE_PRERENDER_FALLBACK_MAP;
  const {
    dynamicRoutes: dynamicRoutesRaw,
    staticRoutes: staticRoutesRaw,
    i18n
  } = require("./" + path.posix.join(relativeDistDir, "routes-manifest.json"));
  const hydrateRoutesManifestItem = (item) => {
    return {
      ...item,
      regex: new RegExp(item.regex)
    };
  };
  const dynamicRoutes = dynamicRoutesRaw.map(hydrateRoutesManifestItem);
  const staticRoutes = staticRoutesRaw.map(hydrateRoutesManifestItem);
  let appPathRoutesManifest = {};
  try {
    appPathRoutesManifest = require("./" + path.posix.join(relativeDistDir, "app-path-routes-manifest.json"));
  } catch (_) {
  }
  const inversedAppRoutesManifest = Object.entries(
    appPathRoutesManifest
  ).reduce(
    (manifest, [originalKey, normalizedKey]) => {
      manifest[normalizedKey] = originalKey;
      return manifest;
    },
    {}
  );
  function addRequestMeta(req, key, value) {
    const NEXT_REQUEST_META = Symbol.for("NextInternalRequestMeta");
    const meta = req[NEXT_REQUEST_META] || {};
    meta[key] = value;
    req[NEXT_REQUEST_META] = meta;
    return meta;
  }
  function normalizeLocalePath(req, pathname, locales) {
    if (!locales) return pathname;
    const lowercasedLocales = locales.map((locale) => locale.toLowerCase());
    const segments = pathname.split("/", 2);
    if (!segments[1]) return pathname;
    const segment = segments[1].toLowerCase();
    const index = lowercasedLocales.indexOf(segment);
    if (index < 0) return pathname;
    const detectedLocale = locales[index];
    pathname = pathname.slice(detectedLocale.length + 1) || "/";
    addRequestMeta(req, "locale", detectedLocale);
    return pathname;
  }
  function normalizeDataPath(req, pathname) {
    if (!(pathname || "/").startsWith("/_next/data")) {
      return pathname;
    }
    pathname = pathname.replace(/\/_next\/data\/[^/]{1,}/, "").replace(/\.json$/, "");
    if (pathname === "/index") {
      return "/";
    }
    return pathname;
  }
  function matchUrlToPage(req, urlPathname) {
    urlPathname = normalizeDataPath(req, urlPathname);
    console.log("before normalize", urlPathname);
    for (const suffixRegex of [
      /\.segments(\/.*)\.segment\.rsc$/,
      /\.prefetch\.rsc$/,
      /\.rsc$/
    ]) {
      urlPathname = urlPathname.replace(suffixRegex, "");
    }
    const urlPathnameWithLocale = urlPathname;
    urlPathname = normalizeLocalePath(req, urlPathname, i18n?.locales);
    console.log("after normalize", urlPathname);
    urlPathname = urlPathname.replace(/\/$/, "") || "/";
    for (const route of [...staticRoutes, ...dynamicRoutes]) {
      if (route.regex.test(urlPathname)) {
        const fallbackFalseMap = prerenderFallbackFalseMap[route.page];
        if (fallbackFalseMap && !(fallbackFalseMap.includes(urlPathname) || fallbackFalseMap.includes(urlPathnameWithLocale))) {
          console.log("fallback: false but not prerendered", {
            page: route.page,
            urlPathname,
            urlPathnameWithLocale,
            paths: Object.values(fallbackFalseMap)
          });
          continue;
        }
        console.log("matched route", route, urlPathname);
        return inversedAppRoutesManifest[route.page] || route.page;
      }
    }
    return inversedAppRoutesManifest[urlPathname] || urlPathname;
  }
  const SYMBOL_FOR_REQ_CONTEXT = Symbol.for("@vercel/request-context");
  function getRequestContext() {
    const fromSymbol = globalThis;
    return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
  }
  const RouterServerContextSymbol = Symbol.for(
    "@next/router-server-methods"
  );
  const routerServerGlobal = globalThis;
  if (!routerServerGlobal[RouterServerContextSymbol]) {
    routerServerGlobal[RouterServerContextSymbol] = {};
  }
  routerServerGlobal[RouterServerContextSymbol]["."] = {
    async render404(req, res) {
      let mod;
      try {
        mod = require("./" + path.posix.join(relativeDistDir, "server", "pages", `404.js`));
        console.log("using 404.js for render404");
      } catch (_) {
        mod = require("./" + path.posix.join(relativeDistDir, "server", "pages", `_error.js`));
        console.log("using _error for render404");
      }
      res.statusCode = 404;
      if (mod) {
        await (await mod).handler(req, res, {
          waitUntil: getRequestContext().waitUntil
        });
      } else {
        res.end("This page could not be found");
      }
    }
  };
  return async function handler(req, res) {
    try {
      addRequestMeta(req, "relativeProjectDir", ".");
      let urlPathname = req.headers["x-matched-path"];
      if (typeof urlPathname !== "string") {
        console.log("no x-matched-path", { url: req.url });
        const parsedUrl = new URL(req.url || "/", "http://n");
        urlPathname = parsedUrl.pathname || "/";
      }
      const page = matchUrlToPage(req, urlPathname);
      const isAppDir = page.match(/\/(page|route)$/);
      console.log("invoking handler", {
        page,
        url: req.url,
        matchedPath: req.headers["x-matched-path"]
      });
      const mod = require("./" + (Boolean(process.env.__PRIVATE_IS_MIDDLEWARE) ? path.posix.join(relativeDistDir, "server", "middleware.js") : path.posix.join(
        relativeDistDir,
        "server",
        isAppDir ? "app" : "pages",
        `${page === "/" ? "index" : page}.js`
      )));
      await (await mod).handler(req, res, {
        waitUntil: getRequestContext().waitUntil
      });
    } catch (error) {
      console.error(`Failed to handle ${req.url}`, error);
      throw error;
    }
  };
}).toString()})()`.replaceAll(
  "process.env.__PRIVATE_RELATIVE_DIST_DIR",
  `"${ctx.projectRelativeDistDir}"`
).replaceAll(
  "process.env.__PRIVATE_PRERENDER_FALLBACK_MAP",
  JSON.stringify(ctx.prerenderFallbackFalseMap)
).replaceAll(
  "process.env.__PRIVATE_IS_MIDDLEWARE",
  JSON.stringify(ctx.isMiddleware)
);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getHandlerSource
});
