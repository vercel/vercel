import type { ValidatedResult } from '../command-validation';
import { INVALID_NEXT_MESSAGE } from '../get-pagination-opts';

/**
 * The `--next` cursor `budgets alerts` prints. The API cursor only marks a
 * position in the list, so this wraps it with the team and the time window the
 * first page resolved, and every later page reads the same window.
 */
export interface BudgetAlertsCursor {
  cursor: string;
  teamId: string;
  /** Epoch ms. */
  since?: number;
  /** Epoch ms. */
  until?: number;
}

export function encodeBudgetAlertsCursor(value: BudgetAlertsCursor): string {
  return Buffer.from(
    JSON.stringify({
      c: value.cursor,
      t: value.teamId,
      s: value.since,
      u: value.until,
    })
  ).toString('base64url');
}

export function decodeBudgetAlertsCursor(
  value: string | undefined
): ValidatedResult<BudgetAlertsCursor | undefined> {
  if (value === undefined) {
    return { valid: true, value: undefined };
  }
  const invalid = {
    valid: false as const,
    code: 'INVALID_NEXT',
    message: INVALID_NEXT_MESSAGE,
  };
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return invalid;
  }
  if (typeof raw !== 'object' || raw === null) {
    return invalid;
  }
  const { c, t, s, u } = raw as Record<string, unknown>;
  if (
    typeof c !== 'string' ||
    typeof t !== 'string' ||
    !isOptionalMs(s) ||
    !isOptionalMs(u)
  ) {
    return invalid;
  }
  return { valid: true, value: { cursor: c, teamId: t, since: s, until: u } };
}

function isOptionalMs(value: unknown): value is number | undefined {
  return value === undefined || Number.isFinite(value);
}
