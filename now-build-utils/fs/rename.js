module.exports = function rename (files, delegate) {
  const files2 = {};

  for (const name in files) {
    files2[delegate(name)] = files[name];
  }

  return files2;
};
