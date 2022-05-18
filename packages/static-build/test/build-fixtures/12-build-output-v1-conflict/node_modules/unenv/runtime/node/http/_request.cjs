"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IncomingMessage = void 0;

var _socket = require("../net/socket");

var _readable = require("../stream/readable");

var _utils = require("../../_internal/utils");

class IncomingMessage extends _readable.Readable {
  constructor(socket) {
    super();
    this.aborted = false;
    this.httpVersion = "1.1";
    this.httpVersionMajor = 1;
    this.httpVersionMinor = 1;
    this.complete = true;
    this.headers = {};
    this.trailers = {};
    this.method = "GET";
    this.url = "/";
    this.statusCode = 200;
    this.statusMessage = "";
    this.readable = false;
    this.socket = this.connection = socket || new _socket.Socket();
  }

  get rawHeaders() {
    return (0, _utils.rawHeaders)(this.headers);
  }

  get rawTrailers() {
    return [];
  }

  setTimeout(_msecs, _callback) {
    return this;
  }

}

exports.IncomingMessage = IncomingMessage;