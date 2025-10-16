"use strict";
export const getHandlerSource = (ctx) => `module.exports = (${(() => {
  const path = require("path");
  globalThis.AsyncLocalStorage = require("async_hooks").AsyncLocalStorage;
  const relativeDistDir = process.env.__PRIVATE_RELATIVE_DIST_DIR;
  const { dynamicRoutes: dynamicRoutesRaw, staticRoutes: staticRoutesRaw, i18n } = require(
    "./" + path.posix.join(relativeDistDir, "routes-manifest.json")
  );
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
    appPathRoutesManifest = require(
      "./" + path.posix.join(relativeDistDir, "app-path-routes-manifest.json")
    );
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
  function normalizeLocalePath(pathname, locales) {
    if (!locales) return { pathname };
    const lowercasedLocales = locales.map((locale) => locale.toLowerCase());
    const segments = pathname.split("/", 2);
    if (!segments[1]) return { pathname };
    const segment = segments[1].toLowerCase();
    const index = lowercasedLocales.indexOf(segment);
    if (index < 0) return { pathname };
    const detectedLocale = locales[index];
    pathname = pathname.slice(detectedLocale.length + 1) || "/";
    return { pathname, detectedLocale };
  }
  function normalizeDataPath(pathname) {
    if (!(pathname || "/").startsWith("/_next/data")) {
      return pathname;
    }
    pathname = pathname.replace(/\/_next\/data\/[^/]{1,}/, "").replace(/\.json$/, "");
    pathname = normalizeLocalePath(pathname, i18n?.locales).pathname;
    if (pathname === "/index") {
      return "/";
    }
    return pathname;
  }
  function matchUrlToPage(urlPathname) {
    urlPathname = normalizeDataPath(urlPathname);
    console.log("before normalize", urlPathname);
    for (const suffixRegex of [
      /\.segments(\/.*)\.segment\.rsc$/,
      /\.prefetch\.rsc$/,
      /\.rsc$/
    ]) {
      urlPathname = urlPathname.replace(suffixRegex, "");
    }
    urlPathname = normalizeLocalePath(urlPathname, i18n?.locales).pathname;
    console.log("after normalize", urlPathname);
    const getPathnameNoSlash = (urlPathname2) => urlPathname2.replace(/\/$/, "") || "/";
    for (const route of [...staticRoutes, ...dynamicRoutes]) {
      if (route.regex.test(urlPathname)) {
        console.log("matched route", route, urlPathname);
        return inversedAppRoutesManifest[route.page] || route.page;
      }
    }
    const pathnameNoSlash = getPathnameNoSlash(urlPathname);
    return inversedAppRoutesManifest[pathnameNoSlash] || pathnameNoSlash;
  }
  const SYMBOL_FOR_REQ_CONTEXT = Symbol.for("@vercel/request-context");
  function getRequestContext() {
    const fromSymbol = globalThis;
    return fromSymbol[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
  }
  return async function handler(req, res) {
    try {
      let urlPathname = req.headers["x-matched-path"];
      if (typeof urlPathname !== "string") {
        const parsedUrl = new URL(req.url || "/", "http://n");
        urlPathname = parsedUrl.pathname || "/";
      }
      const page = matchUrlToPage(urlPathname);
      const isAppDir = page.match(/\/(page|route)$/);
      const mod = require(
        "./" + path.posix.join(
          relativeDistDir,
          "server",
          isAppDir ? "app" : "pages",
          `${page === "/" ? "index" : page}.js`
        )
      );
      await mod.handler(req, res, {
        waitUntil: getRequestContext().waitUntil
      });
    } catch (error) {
      console.error(`Failed to handle ${req.url}`, error);
      throw error;
    }
  };
}).toString()})()`.replace(
  "process.env.__PRIVATE_RELATIVE_DIST_DIR",
  `"${ctx.projectRelativeDistDir}"`
);
