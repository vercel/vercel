import type { LedgerEvent } from '../../util/onboard-session';
import teardownTemplate from './instructions/teardown.md';

/**
 * Follow-up actions onboard offers after a turn ends, once the outcome summary
 * has been printed. Each runs as a continuation prompt in the same session, so
 * the agent keeps its context and the ledger is still live.
 *
 * This list is meant to grow (promote to production, connect a git repository,
 * add a domain, …): a new follow-up is a label, an availability predicate over
 * the ledger, and a prompt.
 */
export interface FollowUp {
  id: string;
  /** Menu label, phrased as the action the user is choosing. */
  label: string;
  /** Whether the action makes sense given what the session actually did. */
  available(ledger: LedgerEvent[]): boolean;
  /** The continuation prompt sent to the agent when chosen. */
  prompt(ledger: LedgerEvent[]): string;
}

/** Ledger events that mean the session created something worth undoing. */
const TEARDOWN_EVENTS = new Set([
  'deployment',
  'resource-provisioned',
  'project-created',
  'project-linked',
]);

export const FOLLOW_UPS: FollowUp[] = [
  {
    id: 'teardown',
    label: 'Tear down everything this session created',
    available: ledger => ledger.some(event => TEARDOWN_EVENTS.has(event.type)),
    prompt: ledger =>
      teardownTemplate
        .split('{{LEDGER}}')
        .join(ledger.map(event => JSON.stringify(event)).join('\n')),
  },
];
