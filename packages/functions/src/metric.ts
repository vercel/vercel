interface RustyRuntimeIpc {
  sendMetric?: (
    name: string,
    value: number,
    tags?: Record<string, string>
  ) => void;
}

const RUSTY_RUNTIME_IPC_SYMBOL = Symbol.for('@vercel/rusty-runtime-ipc');

/**
 * Reports a custom metric for the current Vercel Function invocation.
 *
 * @param name The name of the metric.
 * @param value The numeric value of the metric.
 * @param tags Optional tags to attach to the metric.
 *
 * @example
 *
 * ```js
 * import { metric } from '@vercel/functions';
 *
 * metric('tinybird.query_ms', 100, {
 *   query: 'getUser',
 * });
 * ```
 */
export function metric(
  name: string,
  value: number,
  tags?: Record<string, string>
): void {
  const ipc = (
    globalThis as unknown as Record<symbol, RustyRuntimeIpc | undefined>
  )[RUSTY_RUNTIME_IPC_SYMBOL];

  ipc?.sendMetric?.(name, value, tags);
}
