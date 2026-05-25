/**
 * The Awaiter class is used to manage and await multiple promises.
 */
export class Awaiter {
  private promises: Set<Promise<unknown>> = new Set();
  private onError: ((error: Error) => void) | undefined;

  constructor({ onError }: { onError?: (error: Error) => void } = {}) {
    this.onError = onError ?? console.error;
  }

  public awaiting = () =>
    this.waitForBatch().then(() =>
      this.promises.size > 0 ? this.waitForBatch() : Promise.resolve()
    );

  public waitUntil = (promise: Promise<unknown>) => {
    // Attach an error handler immediately to prevent unhandled promise rejections
    // while still tracking the promise for awaiting later
    const handledPromise = Promise.resolve(promise).catch(this.onError);
    this.promises.add(handledPromise);
  };

  private waitForBatch = async () => {
    const promises = Array.from(this.promises);
    this.promises.clear();
    // Errors are already handled in waitUntil, so we just need to await completion
    await Promise.all(promises);
  };
}
