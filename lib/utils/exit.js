module.exports = code => {
  // We give stdout some time to flush out
  // because there's a node bug where
  // stdout writes are asynchronous
  // https://github.com/nodejs/node/issues/6456
  /* eslint-disable unicorn/no-process-exit */
  setTimeout(() => process.exit(code || 0), 100);
};
