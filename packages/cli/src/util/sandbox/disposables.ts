import { ignoreAbortErrors } from './abort-controller';

// Ensures `Symbol.dispose`/`Symbol.asyncDispose` resolve to the same key esbuild's
// downlevel `using`/`await using` helpers fall back to, so Task 2's interactive
// shell disposes correctly on Node 18-20.3, where these symbols aren't native.
if (typeof (Symbol as { dispose?: symbol }).dispose === 'undefined') {
  Object.defineProperty(Symbol, 'dispose', {
    value: Symbol.for('Symbol.dispose'),
  });
}
if (typeof (Symbol as { asyncDispose?: symbol }).asyncDispose === 'undefined') {
  Object.defineProperty(Symbol, 'asyncDispose', {
    value: Symbol.for('Symbol.asyncDispose'),
  });
}

export function acquireRelease<T extends object>(
  fn: () => T,
  release: (t: NoInfer<T>) => void
): T & Disposable {
  const value = fn();
  return Object.assign(value, {
    [Symbol.dispose]: () => release(value),
  });
}

export function defer(fn: () => void) {
  return { [Symbol.dispose]: fn };
}

export function createAbortController(reason: string) {
  return acquireRelease(
    () => {
      const controller = new AbortController();
      return {
        abort: (newReason?: string) => controller.abort(newReason ?? reason),
        signal: controller.signal,
        ignoreInterruptions: ignoreAbortErrors(controller.signal),
      };
    },
    c => c.abort(reason)
  );
}
