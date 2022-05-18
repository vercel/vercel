"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
module.exports = inherits;

function inherits(ctor, superCtor) {
  if (!superCtor) {
    return;
  }

  ctor.super_ = superCtor;
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
}