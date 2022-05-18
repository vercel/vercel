"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
module.exports = void 0;
var _default = {
  watch(_dir, _cb) {
    return Promise.resolve();
  },

  getInfo(path, _flags, _id) {
    return {
      event: "mock",
      path,
      type: "file",
      flags: 4294967296,
      changes: {
        inode: false,
        finder: false,
        access: false,
        xattrs: false
      }
    };
  }

};
module.exports = _default;