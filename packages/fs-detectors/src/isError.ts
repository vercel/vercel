// These functions are copied from vercel/cli

const isObject = (obj: unknown): obj is Record<string, unknown> =>
  typeof obj === 'object' && obj !== null;

const isError = (error: unknown): error is Error => {
  if (!isObject(error)) return false;

  // Check for `Error` objects instantiated within the current global context.
  if (error instanceof Error) return true;

  // Walk the prototype tree until we find a matching object.
  while (error) {
    if (Object.prototype.toString.call(error) === '[object Error]') return true;
    // eslint-disable-next-line no-param-reassign -- TODO: Fix eslint error following @vercel/style-guide migration
    error = Object.getPrototypeOf(error);
  }

  return false;
};

export const isErrnoException = (
  error: unknown
): error is NodeJS.ErrnoException => {
  return isError(error) && 'code' in error;
};
