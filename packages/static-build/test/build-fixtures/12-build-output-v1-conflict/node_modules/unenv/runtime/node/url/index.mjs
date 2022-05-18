export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;
export const parse = function(urlString, parseQueryString, slashesDenoteHost) {
  const url = new URL(urlString);
  if (!parseQueryString && !slashesDenoteHost) {
    return url;
  }
  throw new Error("parseQueryString and slashesDenoteHost are unsupported");
};
export const resolve = function(from, to) {
  const resolvedUrl = new URL(to, new URL(from, "resolve://"));
  if (resolvedUrl.protocol === "resolve:") {
    const { pathname, search, hash } = resolvedUrl;
    return pathname + search + hash;
  }
  return resolvedUrl.toString();
};
export const urlToHttpOptions = function(url) {
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
export const format = function(urlInput, options) {
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
export const domainToASCII = function(domain) {
  return domain;
};
export const domainToUnicode = function(domain) {
  return domain;
};
export const pathToFileURL = function(path) {
  return new URL(path);
};
export const fileURLToPath = function(url) {
  if (typeof url === "string") {
    url = new URL(url);
  }
  return url.pathname;
};
export default {
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
