export interface EventRequestOptions {
  /** Cancels this request, not a subscription already accepted by Connect. */
  signal?: AbortSignal;
  /** Request deadline in milliseconds, including credential resolution. */
  timeout?: number;
  /** Overall deadline in milliseconds. The earlier supplied deadline wins. */
  maxTotalTimeout?: number;
}

/** Bound credential resolution, fetch and response parsing with one deadline. */
export async function eventRequest<T>(
  options: EventRequestOptions | undefined,
  run: (signal: AbortSignal | undefined) => Promise<T>
): Promise<T> {
  const { signal: externalSignal, timeout, maxTotalTimeout } = options ?? {};
  externalSignal?.throwIfAborted();
  const deadlines = [timeout, maxTotalTimeout].filter(
    (value): value is number => value !== undefined
  );
  if (
    deadlines.some(
      value => !Number.isInteger(value) || value <= 0 || value > 2_147_483_647
    )
  ) {
    throw new TypeError('Request timeouts must be positive 32-bit integers.');
  }
  const controller = deadlines.length ? new AbortController() : undefined;
  const signal = controller?.signal ?? externalSignal;
  const forwardAbort = () => controller?.abort(externalSignal?.reason);
  externalSignal?.addEventListener('abort', forwardAbort, { once: true });
  const timer = controller
    ? setTimeout(
        () =>
          controller.abort(
            new DOMException('Request timed out.', 'TimeoutError')
          ),
        Math.min(...deadlines)
      )
    : undefined;
  let onAbort: (() => void) | undefined;
  try {
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal?.reason);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    return await Promise.race([run(signal), aborted]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    externalSignal?.removeEventListener('abort', forwardAbort);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}
