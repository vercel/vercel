/**
 * This error should be thrown from a Builder in
 * order to stop the build and print a message.
 * This is necessary to avoid printing a stack trace.
 */
export class NowBuildError extends Error {
  public hideStackTrace = true;
  public code: string;
  public link?: string;

  constructor({ message, code, link }: Props) {
    super(message);
    this.code = code;
    this.link = link;
  }
}

interface Props {
  /**
   * The error message to display to the end-user.
   * Should be short yet descriptive of what they did wrong.
   */
  message: string;
  /**
   * A unique error code for this particular error.
   * Should start with the builder name such as `NODE_`.
   */
  code: string;
  /**
   * Optional hyperlink starting with https://vercel.com to
   * link to more information about this error.
   */
  link?: string;
}
