/** A CLI-authored error that is safe to show without exposing API payloads. */
export class DescribeError extends Error {
  constructor(
    public readonly reason: string,
    message: string
  ) {
    super(message);
  }
}
