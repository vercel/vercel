import { AsyncLocalStorage } from 'node:async_hooks';

export type Data = {
  waitUntil: (promise: Promise<unknown>) => void;
};

export const Context = new AsyncLocalStorage<Data>();

export const reader = {
  get: () => Context.getStore(),
  with: <T>(ctx: Data, fn: () => T) => {
    return Context.run(ctx, fn);
  },
};

export const symbol = Symbol.for('@vercel/request-context');

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
