/**
 * The Awaiter class is used to manage and await multiple promises.
 */
export class Awaiter {
  private waitFunctions: Set<() => Promise<unknown>> = new Set();
  private onError: ((error: Error) => void) | undefined;

  constructor({ onError }: { onError?: (error: Error) => void } = {}) {
    this.onError = onError;
  }

  public awaiting = async () => {
    return this.waitForBatch().then(() => {
      return this.waitFunctions.size > 0
        ? this.waitForBatch()
        : Promise.resolve();
    });
  };

  public waitUntil = (
    promiseOrFunc: Promise<unknown> | (() => Promise<unknown>)
  ) => {
    this.waitFunctions.add(
      typeof promiseOrFunc === 'function' ? promiseOrFunc : () => promiseOrFunc
    );
  };

  private waitForBatch = async () => {
    const promiseOrFuncs = Array.from(this.waitFunctions);
    this.waitFunctions.clear();
    await Promise.all(
      promiseOrFuncs.map(func => {
        return Promise.resolve(func()).then(
          () => undefined,
          error => {
            const onError = this.onError ?? console.error;
            onError(error);
          }
        );
      })
    );
  };
}
