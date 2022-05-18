"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Transform = void 0;

var _duplex = require("./duplex");

class Transform extends _duplex.Duplex {
  _transform(chunk, encoding, callback) {}

  _flush(callback) {}

}

exports.Transform = Transform;