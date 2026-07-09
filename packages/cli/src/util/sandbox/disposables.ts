import { ignoreAbortErrors } from './abort-controller';

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
