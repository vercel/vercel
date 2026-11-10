/**
 * Evals that must NOT run, even when explicitly requested via CLI_EVAL_EVALS.
 *
 * marketplace/*: the teardown in these evals lists storage stores and
 * deletes every one it can see. Do not re-enable until the teardown deletes
 * only the exact resources the eval created (and the team-guard token checks
 * are in place; see team-guard.ts).
 */
export const DISABLED_EVAL_PREFIXES: readonly string[] = ['marketplace/'];

export function isDisabledEval(evalName: string): boolean {
  return DISABLED_EVAL_PREFIXES.some(
    prefix =>
      evalName === prefix.replace(/\/$/, '') || evalName.startsWith(prefix)
  );
}

/** Split an eval list into runnable and disabled-dropped, for logging. */
export function filterDisabledEvals(evals: string[]): {
  allowed: string[];
  dropped: string[];
} {
  const allowed: string[] = [];
  const dropped: string[] = [];
  for (const evalName of evals) {
    (isDisabledEval(evalName) ? dropped : allowed).push(evalName);
  }
  return { allowed, dropped };
}
