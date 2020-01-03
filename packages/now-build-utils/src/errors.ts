/**
 * This error should be thrown from a Builder in
 * order to stop the build and print a message.
 * This is necessary to avoid printing a stack trace.
 */
export class NowBuildError extends Error {
  public code: string;

  constructor({ message, code }: Props) {
    super(message);
    this.code = code;
  }
}

interface Props {
  message: string;
  code: string;
}
