"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.urlToHttpOptions = exports.resolve = exports.pathToFileURL = exports.parse = exports.format = exports.fileURLToPath = exports.domainToUnicode = exports.domainToASCII = exports.default = exports.URLSearchParams = exports.URL = void 0;
const URL = globalThis.URL;
exports.URL = URL;
const URLSearchParams = globalThis.URLSearchParams;
exports.URLSearchParams = URLSearchParams;

const parse = function (urlString, parseQueryString, slashesDenoteHost) {
  const url = new URL(urlString);

  if (!parseQueryString && !slashesDenoteHost) {
    return url;
  }

  throw new Error("parseQueryString and slashesDenoteHost are unsupported");
};

exports.parse = parse;

const resolve = function (from, to) {
  const resolvedUrl = new URL(to, new URL(from, "resolve://"));

  if (resolvedUrl.protocol === "resolve:") {
    const {
      pathname,
      search,
      hash
    } = resolvedUrl;
    return pathname + search + hash;
  }

  return resolvedUrl.toString();
};

exports.resolve = resolve;

const urlToHttpOptions = function (url) {
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    hash: url.hash,
    search: url.search,
    pathname: url.pathname,
    path: url.pathname + url.search || "",
    href: url.href,
    port: url.port,
    auth: url.username ? url.username + url.password ? ":" + url.password : "" : ""
  };
};

exports.urlToHttpOptions = urlToHttpOptions;

const format = function (urlInput, options) {
  let url;

  if (typeof urlInput === "string") {
    url = new URL(urlInput);
  } else if (!(urlInput instanceof URL)) {
    throw new Error("format urlObject is not supported");
  } else {
    url = urlInput;
  }

  if (options) {
    if (options.auth === false) {
      url.username = "";
      url.password = "";
    }

    if (options.fragment === false) {
      url.hash = "";
    }

    if (options.search === false) {
      url.search = "";
    }
  }

  return url.toString();
};

exports.format = format;

const domainToASCII = function (domain) {
  return domain;
};

exports.domainToASCII = domainToASCII;

const domainToUnicode = function (domain) {
  return domain;
};

exports.domainToUnicode = domainToUnicode;

const pathToFileURL = function (path) {
  return new URL(path);
};

exports.pathToFileURL = pathToFileURL;

const fileURLToPath = function (url) {
  if (typeof url === "string") {
    url = new URL(url);
  }

  return url.pathname;
};

exports.fileURLToPath = fileURLToPath;
var _default = {
  URL,
  URLSearchParams,
  domainToASCII,
  domainToUnicode,
  fileURLToPath,
  format,
  parse,
  pathToFileURL,
  resolve,
  urlToHttpOptions
};
module.exports = _default;