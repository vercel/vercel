/**
 * Session plumbing for `vercel ship`.
 *
 * When ship drives a coding agent, every `vercel` invocation the agent makes
 * inherits `VERCEL_SHIP_SESSION_DIR`. That one variable powers two mechanisms,
 * both deliberately built from plain files so they can be inspected with `cat`
 * and tested with `fs`:
 *
 * - **The approval gate** (`approvals/`): commands that spend money, touch
 *   production, or delete remote resources pause and ask the supervising ship
 *   process for the user's decision before executing. The gate is called from
 *   inside each command handler after its own argument parsing — never from
 *   shell-command classification — so it is deterministic on what is actually
 *   about to happen, and does not depend on the agent complying with prose.
 *
 * - **The ledger** (`ledger.ndjson`): the CLI journals its own effects from
 *   typed data at the moment it performs them — deployments with their real
 *   URL and target, resources provisioned, projects linked and removed. The
 *   session's inventory is a record of what the machine did, not what the
 *   model remembers doing.
 *
 * Both are mistake prevention, not sandboxing: the agent shares the user's
 * filesystem and credentials, so an adversarial agent could bypass them. The
 * observed failure mode is confusion, and confusion goes through the CLI.
 */
export { SHIP_SESSION_DIR_ENV, getShipSessionDir } from './session-dir';
export { recordSessionEvent, readLedger, LEDGER_FILENAME } from './ledger';
export type { LedgerEvent } from './ledger';
export { confirmGatedOperation } from './gate';
export type { GateOperation } from './gate';
export {
  requestApproval,
  ApprovalWatcher,
  APPROVALS_DIRNAME,
} from './approval';
export type {
  ApprovalDecision,
  ApprovalRequest,
  ApprovalResult,
  ApprovalVerdict,
  GateClass,
} from './approval';
