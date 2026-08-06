/**
 * The one environment variable a ship session sets. Everything else — the
 * approvals directory, the ledger — lives under the directory it names.
 */
export const SHIP_SESSION_DIR_ENV = 'VERCEL_SHIP_SESSION_DIR';

/** The session directory, when this process runs inside a ship session. */
export function getShipSessionDir(): string | undefined {
  const dir = process.env[SHIP_SESSION_DIR_ENV];
  return dir && dir.length > 0 ? dir : undefined;
}
