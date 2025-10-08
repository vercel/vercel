/**
 * Wraps a function such that only one in-flight invocation is active at a time.
 *
 * That is, if the returned function is invoked more that one time before the
 * promise returned from the initial invocation resolves, then the same promise
 * is returned for subsequent invocations.
 *
 * Once the promise has resolved, the next invocation of the returned function
 * will re-invoke the original function again.
 */
export function sharedPromise<P extends any[], V, T>(
  fn: (this: T, ...args: P) => Promise<V>
) {
  let promise: Promise<V> | null = null;
  return function (this: T, ...args: P) {
    if (!promise) {
      promise = fn.apply(this, args);
      promise.finally(() => {
        promise = null;
      });
    }
    return promise;
  };
}
