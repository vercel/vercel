"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isRedirect = exports.default = exports.Response = exports.Request = exports.Headers = exports.FetchError = exports.AbortError = void 0;

const fetch = (...args) => globalThis.fetch(...args);

const Headers = globalThis.Headers;
exports.Headers = Headers;
const Request = globalThis.Request;
exports.Request = Request;
const Response = globalThis.Response;
exports.Response = Response;
const FetchError = Error;
exports.FetchError = FetchError;
const AbortError = Error;
exports.AbortError = AbortError;
const redirectStatus = new Set([301, 302, 303, 307, 308]);

const isRedirect = code => redirectStatus.has(code);

exports.isRedirect = isRedirect;
fetch.Promise = globalThis.Promise;
fetch.isRedirect = isRedirect;
var _default = fetch;
module.exports = _default;