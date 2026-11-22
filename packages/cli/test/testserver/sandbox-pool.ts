// Which Testserver sandbox a worker uses.
//
// `scripts/testserver/main.mjs` passes the sandboxes as a
// comma-separated `TESTSERVER_BASES` and the config runs 4 workers per sandbox.
// Vitest gives each running test file a free `VITEST_POOL_ID` (1..maxWorkers)
// and frees it when the file ends, so mapping pool ids round-robin onto the
// sandboxes keeps every sandbox at 4 or fewer concurrent test ids, the limit
// front measured before service boot slows down.

/** Concurrent test ids per sandbox; the config runs this many workers per sandbox. */
export const WORKERS_PER_SANDBOX = 4;

/**
 * `TESTSERVER_BASES`, else `TESTSERVER_BASE`, without trailing slashes or
 * duplicates. A repeated base would get its own share of workers and push
 * that sandbox past WORKERS_PER_SANDBOX.
 */
export function testserverBases(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const raw = env.TESTSERVER_BASES || env.TESTSERVER_BASE || '';
  const bases = raw
    .split(',')
    .map(base => base.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [...new Set(bases)];
}

/** The sandbox for this worker, and its 0-based index. */
export function pickSandbox(
  bases: string[],
  poolId: string | undefined
): { base: string; index: number } {
  const id = Number(poolId);
  const index = Number.isInteger(id) && id > 0 ? (id - 1) % bases.length : 0;
  return { base: bases[index], index };
}
