/**
 * The one environment variable an onboard session sets. Everything else — the
 * approvals directory, the ledger — lives under the directory it names.
 */
export const ONBOARD_SESSION_DIR_ENV = 'VERCEL_ONBOARD_SESSION_DIR';

/** The session directory, when this process runs inside an onboard session. */
export function getOnboardSessionDir(): string | undefined {
  const dir = process.env[ONBOARD_SESSION_DIR_ENV];
  return dir && dir.length > 0 ? dir : undefined;
}
