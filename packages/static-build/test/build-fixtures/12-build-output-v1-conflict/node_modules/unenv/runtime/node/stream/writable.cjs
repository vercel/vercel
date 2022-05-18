"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Writable = void 0;

var _events = require("events");

class Writable extends _events.EventEmitter {
  constructor(_opts) {
    super();
    this.writable = true;
    this.writableEnded = false;
    this.writableFinished = false;
    this.writableHighWaterMark = 0;
    this.writableLength = 0;
    this.writableObjectMode = false;
    this.writableCorked = 0;
    this.destroyed = false;
    this._encoding = "utf-8";
  }

  pipe(_destenition, _options) {
    return {};
  }

  _write(chunk, encoding, callback) {
    this._data = chunk;
    this._encoding = encoding;

    if (callback) {
      callback();
    }
  }

  _writev(_chunks, _callback) {}

  _destroy(_error, _callback) {}

  _final(_callback) {}

  write(chunk, arg2, arg3) {
    const encoding = typeof arg2 === "string" ? this._encoding : "utf-8";
    const cb = typeof arg2 === "function" ? arg2 : typeof arg3 === "function" ? arg3 : void 0;

    this._write(chunk, encoding, cb);

    return true;
  }

  setDefaultEncoding(_encoding) {
    return this;
  }

  end(arg1, arg2, arg3) {
    const cb = typeof arg1 === "function" ? arg1 : typeof arg2 === "function" ? arg2 : typeof arg3 === "function" ? arg3 : void 0;
    const data = arg1 !== cb ? arg1 : void 0;

    if (data) {
      const encoding = arg2 !== cb ? arg2 : void 0;
      this.write(data, encoding, cb);
    }

    this.writableEnded = true;
    this.writableFinished = true;
    this.emit("close");
    this.emit("finish");
    return this;
  }

  cork() {}

  uncork() {}

  destroy(_error) {
    this.destroyed = true;
    delete this._data;
    this.removeAllListeners();
    return this;
  }

}

exports.Writable = Writable;