// @flow

type NowErrorArgs<T, M> = {
  code: T,
  meta: M,
  message: string
};

// A generic error to rule them all
export class NowError<T, M> extends Error {
  meta: M;
  code: T;

  constructor({ code, message, meta }: NowErrorArgs<T, M>) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}
