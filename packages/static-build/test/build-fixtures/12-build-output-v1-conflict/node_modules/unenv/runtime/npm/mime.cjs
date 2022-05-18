"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
module.exports = void 0;

var _mime2 = _interopRequireDefault(require("_mime"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const mime = { ..._mime2.default
};
mime.lookup = mime.getType;
mime.extension = mime.getExtension;

const noop = () => {};

mime.define = noop;
mime.load = noop;
mime.default_type = "application/octet-stream";
mime.charsets = {
  lookup: () => "UTF-8"
};
var _default = mime;
module.exports = _default;