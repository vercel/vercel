"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
module.exports = void 0;

function createMock(name, overrides = {}) {
  const fn = function () {};

  fn.prototype.name = name;
  const props = {};
  return new Proxy(fn, {
    get(_target, prop) {
      if (prop === "caller") {
        return null;
      }

      if (prop === "__createMock__") {
        return createMock;
      }

      if (prop in overrides) {
        return overrides[prop];
      }

      return props[prop] = props[prop] || createMock(`${name}.${prop.toString()}`);
    },

    apply(_target, _this, _args) {
      return createMock(`${name}()`);
    },

    construct(_target, _args, _newT) {
      return createMock(`[${name}]`);
    },

    enumerate(_target) {
      return [];
    }

  });
}

var _default = createMock("mock");

module.exports = _default;