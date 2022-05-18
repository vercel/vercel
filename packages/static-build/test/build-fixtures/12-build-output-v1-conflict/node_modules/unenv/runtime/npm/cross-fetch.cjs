"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.fetch = exports.default = exports.Response = exports.Request = exports.Headers = void 0;

const fetch = (...args) => globalThis.fetch(...args);

exports.fetch = fetch;
var _default = fetch;
module.exports = _default;
const Headers = globalThis.Headers;
exports.Headers = Headers;
const Request = globalThis.Request;
exports.Request = Request;
const Response = globalThis.Response;
exports.Response = Response;