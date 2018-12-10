export class NowError<Meta> extends Error {
  code: string;
  meta: Meta;

  constructor({
    code,
    message,
    meta
  }: {
    code: string;
    message: string;
    meta: Meta;
  }) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}
