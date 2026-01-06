import util from 'node:util';

export const isErrnoException = (
  error: unknown,
  code: string | undefined = undefined
): error is NodeJS.ErrnoException => {
  return (
    util.types.isNativeError(error) &&
    'code' in error &&
    (code === undefined || error.code === code)
  );
};

interface PythonAnalysisErrorProps {
  /**
   * The error message to display to the end-user.
   * Should be short yet descriptive of what went wrong.
   */
  message: string;
  /**
   * A unique error code for this particular error.
   * Should start with `PYTHON_` prefix.
   */
  code: string;
  /**
   * The path to the file that caused the error, if applicable.
   */
  path?: string;
  /**
   * Optional hyperlink to documentation with more information about this error.
   */
  link?: string;
  /**
   * Optional "action" to display before the `link`, such as "Learn More".
   */
  action?: string;
}

/**
 * This error should be thrown from Python analysis functions
 * when encountering configuration or manifest parsing errors.
 * This is necessary to provide clear error messages without stack traces.
 */
export class PythonAnalysisError extends Error {
  public hideStackTrace = true;
  public code: string;
  public path?: string;
  public link?: string;
  public action?: string;

  constructor({ message, code, path, link, action }: PythonAnalysisErrorProps) {
    super(message);
    this.name = 'PythonAnalysisError';
    this.code = code;
    this.path = path;
    this.link = link;
    this.action = action;
  }
}
