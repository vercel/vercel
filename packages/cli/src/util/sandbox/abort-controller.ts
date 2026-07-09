export function ignoreAbortErrors(signal: AbortSignal) {
  return (err: unknown) => {
    if (signal.aborted) {
      return;
    }
    throw err;
  };
}
