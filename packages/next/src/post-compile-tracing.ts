import { Span } from '@vercel/build-utils';

const HEARTBEAT_INTERVAL_MS = 15_000;

function log(label: string, msg: string) {
  console.log(`[POST_COMPILE] ${label}: ${msg}`);
}

/**
 * Wraps an async post-compile phase in a child `Span` and additionally emits
 * start/heartbeat/end lines to stdout.
 *
 * The existing `Span` only reports when `stop()` is called, so a phase that
 * wedges never surfaces in traces. The console output here lands in the
 * Vercel build log via Hive's stdout forwarder, giving an in-band liveness
 * signal even when the phase never completes.
 */
export async function tracedPhase<T>(
  parent: Span,
  label: string,
  fn: (span: Span) => Promise<T> | T
): Promise<T> {
  const child = parent.child(label);
  const start = Date.now();
  log(label, 'start');
  const heartbeat = setInterval(() => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    log(label, `alive +${elapsed}s`);
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();
  try {
    const result = await fn(child);
    log(label, `done in ${Date.now() - start}ms`);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(label, `failed in ${Date.now() - start}ms: ${msg}`);
    throw err;
  } finally {
    clearInterval(heartbeat);
    child.stop();
  }
}
