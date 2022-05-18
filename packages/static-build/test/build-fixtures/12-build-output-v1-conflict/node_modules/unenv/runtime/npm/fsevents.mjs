export default {
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
