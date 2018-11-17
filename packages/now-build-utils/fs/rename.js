module.exports = function rename(files, delegate) {
  return Object.keys(files).reduce(
    (newFiles, name) => ({
      ...newFiles,
      [delegate(name)]: files[name],
    }),
    {},
  );
};
