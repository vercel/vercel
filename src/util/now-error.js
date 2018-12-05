// A generic error to rule them all
export class NowError extends Error {
  constructor({ code, message, meta }) {
    super(message);

    this.code = code;
    this.meta = meta;
  }
}
