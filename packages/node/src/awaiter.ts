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
    this.promises.add(promise);
  };

  private waitForBatch = async () => {
    const promises = Array.from(this.promises);
    this.promises.clear();
    await Promise.all(
      promises.map(promise =>
        Promise.resolve(promise).then(() => undefined, this.onError)
      )
    );
  };
}
