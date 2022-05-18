import _global from "./globalThis.mjs";
try {
  const _defineOpts = { enumerable: false, value: _global };
  Object.defineProperties(_global, {
    self: _defineOpts,
    window: _defineOpts,
    global: _defineOpts
  });
} catch (_err) {
}
export default _global;
