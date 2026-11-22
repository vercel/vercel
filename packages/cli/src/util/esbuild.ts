/**
 * Load esbuild only when a JavaScript or TypeScript config needs compilation.
 * Native entrypoints can provide a loader that selects a lazily materialized
 * platform executable without leaking ESBUILD_BINARY_PATH to user code.
 */
export async function loadEsbuild(): Promise<typeof import('esbuild')> {
  const nativeLoader = Reflect.get(
    globalThis,
    Symbol.for('vercel.cli.loadEsbuild')
  );
  return typeof nativeLoader === 'function'
    ? nativeLoader()
    : import('esbuild');
}
