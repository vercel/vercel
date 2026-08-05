/**
 * Session plumbing for `vercel ship`.
 *
 * When ship drives a coding agent, every `vercel` invocation the agent makes
 * inherits `VERCEL_SHIP_SESSION_DIR`. That one variable powers two mechanisms,
 * both deliberately built from plain files so they can be inspected with `cat`
 * and tested with `fs`:
 *
 * - **The approval gate** (`approvals/`): commands classified as spending
 *   money, touching production, or deleting remote resources pause and ask the
 *   supervising ship process for the user's decision before executing. The
 *   gate is deterministic — prose in the mission asks the agent to behave; the
 *   gate does not depend on it complying.
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
export { classifyGatedOperation } from './classify';
export type { GateClass, GatedOperation } from './classify';
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
} from './approval';
