import type Client from '../../util/client';
import output from '../../output-manager';

export type DeploymentTarget = 'production' | 'preview';

export interface ConfirmProductionOptions {
  /**
   * The target environment of the deployment that --trace is going to capture.
   * Only `'production'` triggers prompting or non-TTY failure; any other value
   * (including `'preview'`) short-circuits with `true`.
   */
  deploymentTarget: DeploymentTarget;
  /** True when the user passed `--yes`. Skips prompting on production. */
  yes: boolean;
  /** True when stdin is a TTY (interactive). */
  isTTY: boolean;
}

/**
 * Result of `confirmProduction`:
 *
 * - `true`  — proceed with the trace (preview, or production confirmed/--yes).
 * - `false` — user declined the prompt; caller should abort.
 *
 * Non-TTY without --yes against production does not return; instead this
 * function emits an actionable error to stderr and the caller is expected to
 * exit with code 1.
 */
export type ConfirmProductionResult = 'proceed' | 'declined' | 'non-tty-no-yes';

/**
 * Gate that decides whether a `--trace` invocation may proceed when the
 * deployment target is production.
 *
 * Five paths:
 *   1. preview          → proceed (no prompt)
 *   2. prod + --yes     → proceed (no prompt)
 *   3. prod + non-TTY   → emit error, return 'non-tty-no-yes'
 *   4. prod + TTY + yes → proceed (user confirmed)
 *   5. prod + TTY + no  → return 'declined'
 */
export async function confirmProduction(
  client: Client,
  { deploymentTarget, yes, isTTY }: ConfirmProductionOptions
): Promise<ConfirmProductionResult> {
  if (deploymentTarget !== 'production') {
    return 'proceed';
  }

  if (yes) {
    return 'proceed';
  }

  if (!isTTY) {
    output.error(
      'Use --yes to capture traces on production from non-interactive contexts.'
    );
    return 'non-tty-no-yes';
  }

  const confirmed = await client.input.confirm(
    'You are about to capture a trace against a production deployment. Continue?',
    false
  );

  return confirmed ? 'proceed' : 'declined';
}
