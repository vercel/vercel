import type { LedgerEvent } from '../../util/onboard-session';
import { unresolvedHandoffs } from './browser-handoff';
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

/** Menu id for resuming provider setup after a browser checkout. */
export const CONTINUE_PROVIDER_SETUP = 'continue-provider-setup';

export const FOLLOW_UPS: FollowUp[] = [
  {
    id: CONTINUE_PROVIDER_SETUP,
    label: 'Continue provider setup (browser checkout finished)',
    available: ledger => unresolvedHandoffs(ledger).length > 0,
    prompt: () =>
      [
        'The user finished (or believes they finished) the provider setup',
        'that required a browser. Before provisioning anything, check',
        'whether the installation and resource already exist — the checkout',
        'may have created them — using `vercel integration list` (and the',
        'integration’s own listing commands). If the resource exists,',
        'connect it and continue the plan; only if it verifiably does not',
        'exist should you provision again. Never create a duplicate',
        'resource.',
      ].join('\n'),
  },
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
