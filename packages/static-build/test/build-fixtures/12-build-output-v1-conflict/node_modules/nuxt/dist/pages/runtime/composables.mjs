const warnRuntimeUsage = (method) => console.warn(`${method}() is a compiler-hint helper that is only usable inside the script block of a single file component. Its arguments should be compiled away and passing it at runtime has no effect.`);
export const definePageMeta = (meta) => {
  if (process.dev) {
    warnRuntimeUsage("definePageMeta");
  }
};
