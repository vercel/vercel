'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const Blob = globalThis.Blob;
const File = globalThis.File;
const FormData = globalThis.FormData;
const Headers = globalThis.Headers;
const Request = globalThis.Request;
const Response = globalThis.Response;
const AbortController = globalThis.AbortController;
const fetch = globalThis.fetch || (() => {
  throw new Error("global fetch is not available!");
});

exports.AbortController = AbortController;
exports.Blob = Blob;
exports.File = File;
exports.FormData = FormData;
exports.Headers = Headers;
exports.Request = Request;
exports.Response = Response;
exports["default"] = fetch;
exports.fetch = fetch;
