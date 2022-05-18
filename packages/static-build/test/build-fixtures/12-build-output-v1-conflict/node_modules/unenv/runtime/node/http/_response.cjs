"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ServerResponse = void 0;

var _writable = require("../stream/writable");

class ServerResponse extends _writable.Writable {
  constructor(req) {
    super();
    this.statusCode = 200;
    this.statusMessage = "";
    this.upgrading = false;
    this.chunkedEncoding = false;
    this.shouldKeepAlive = false;
    this.useChunkedEncodingByDefault = false;
    this.sendDate = false;
    this.finished = false;
    this.headersSent = false;
    this.connection = null;
    this.socket = null;
    this._headers = {};
    this.req = req;
  }

  assignSocket(socket) {
    socket._httpMessage = this;
    this.socket = socket;
    this.connection = socket;
    this.emit("socket", socket);

    this._flush();
  }

  _flush() {
    this.flushHeaders();
  }

  detachSocket(_socket) {}

  writeContinue(_callback) {}

  writeHead(statusCode, arg1, arg2) {
    if (statusCode) {
      this.statusCode = statusCode;
    }

    if (typeof arg1 === "string") {
      this.statusMessage = arg1;
      arg1 = void 0;
    }

    const headers = arg2 || arg1;

    if (headers) {
      if (Array.isArray(headers)) {} else {
        for (const key in headers) {
          this.setHeader(key, headers[key]);
        }
      }
    }

    this.headersSent = true;
    return this;
  }

  writeProcessing() {}

  setTimeout(_msecs, _callback) {
    return this;
  }

  setHeader(name, value) {
    this._headers[name.toLowerCase()] = value + "";
    return this;
  }

  getHeader(name) {
    return this._headers[name.toLowerCase()];
  }

  getHeaders() {
    return this._headers;
  }

  getHeaderNames() {
    return Object.keys(this._headers);
  }

  hasHeader(name) {
    return name.toLowerCase() in this._headers;
  }

  removeHeader(name) {
    delete this._headers[name.toLowerCase()];
  }

  addTrailers(_headers) {}

  flushHeaders() {}

}

exports.ServerResponse = ServerResponse;