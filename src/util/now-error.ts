export class NowError<C, Meta> extends Error {
  code: C;
  meta: Meta;

  constructor({
    code,
    message,
    meta
  }: {
    code: C;
    message: string;
    meta: Meta;
  }) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}
