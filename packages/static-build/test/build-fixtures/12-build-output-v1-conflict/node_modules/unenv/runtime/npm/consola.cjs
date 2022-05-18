"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
module.exports = void 0;

var _proxy = _interopRequireDefault(require("../mock/proxy"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var _default = _proxy.default.__createMock__("consola", { ...console
});

module.exports = _default;