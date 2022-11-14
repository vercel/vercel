export default (code?: number) =>
  new Promise(() => {
    // We give stdout some time to flush out
    // because there's a node bug where
    // stdout writes are asynchronous
    // https://github.com/nodejs/node/issues/6456
    setTimeout(() => process.exit(code || 0), 100);
  });
