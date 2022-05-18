"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  posix: true,
  win32: true,
  platform: true
};
exports.win32 = exports.posix = exports.platform = exports.default = void 0;

var _path = _interopRequireWildcard(require("pathe"));

Object.keys(_path).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _path[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _path[key];
    }
  });
});

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const _pathModule = { ..._path,
  platform: "posix",
  posix: void 0,
  win32: void 0
};
_pathModule.posix = _pathModule;
_pathModule.win32 = _pathModule;
const posix = _pathModule;
exports.posix = posix;
const win32 = _pathModule;
exports.win32 = win32;
const platform = "posix";
exports.platform = platform;
var _default = _pathModule;
module.exports = _default;