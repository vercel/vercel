import { access } from 'node:fs/promises';
import { join } from 'node:path';
import type Client from '../../util/client';
import {
  readLedger,
  recordSessionEvent,
  type LedgerEvent,
} from '../../util/onboard-session';
import output from '../../output-manager';
import { onboardVerify } from './verify';

/**
 * Deterministic verification steering: when the agent ends a turn while the
 * session's latest deployment is unverified or failing verification, onboard
 * sends it back — with measured evidence, not with the model's recall.
 *
 * Everything here reads typed ledger events (`deployment`, `verification`,
 * `browser-handoff`, `verification-steering`) and nothing else: no
 * transcript parsing, no output scraping. The nudge budget itself is derived
 * from the ledger, so it survives session continuation for free.
 *
 * The out-of-band re-run is the point: before nudging, onboard re-executes
 * the session's own verify manifest, so a deployment the agent silently
 * fixed passes quietly, and a nudge always quotes checks this process just
 * measured. The manifest is the session's declared, re-runnable definition
 * of done — re-running it is enforcement, not mutation on onboard's own
 * initiative.
 */

/** Automatic nudges allowed per deployment before the human takes over. */
const MAX_NUDGES_PER_DEPLOYMENT = 2;

/** Failing checks quoted in a nudge; the rest are summarized by count. */
const MAX_QUOTED_CHECKS = 10;

export type SteeringReason =
  | 'verification-failed'
  | 'verification-missing'
  | 'browser-handoff-pending';

export interface SteeringNudge {
  reason: SteeringReason;
  /** Deployment (or handoff URL) the nudge is about. */
  subject: string;
  /** Which nudge this is for the subject, 1-based. */
  nudge: number;
  /** One vercel-voiced line, rendered before the steering turn is sent. */
  announce: string;
  /** The steering turn sent to the agent. */
  prompt: string;
}

interface VerificationEvent {
  deployment: string;
  passed: number;
  failed: number;
  protectionBlocked?: number;
  checks: Array<{
    method?: string;
    path?: string;
    status?: number;
    ok?: boolean;
    failures?: string[];
  }>;
}

/**
 * Decide, from the ledger alone, whether the agent needs steering.
 * Pure and deterministic; `undefined` means the session state warrants no
 * nudge (nothing deployed yet, verification passing, or budget spent).
 */
export function decideSteering(
  ledger: LedgerEvent[]
): { reason: SteeringReason; subject: string; nudge: number } | undefined {
  // A provider checkout waiting on the user outranks verification: the agent
  // retrying provisioning while the human is mid-checkout is the loop the
  // handoff event exists to prevent.
  const handoff = pendingBrowserHandoff(ledger);
  if (handoff) {
    const previous = countHandoffNudges(ledger, handoff);
    if (previous < 1) {
      return {
        reason: 'browser-handoff-pending',
        subject: handoff,
        nudge: previous + 1,
      };
    }
  }

  const deployment = latestDeployment(ledger);
  if (!deployment) {
    return undefined;
  }

  const verification = latestVerification(ledger, deployment);
  const reason: SteeringReason | undefined =
    verification === undefined
      ? 'verification-missing'
      : verification.failed > 0
        ? 'verification-failed'
        : undefined;
  if (!reason) {
    return undefined;
  }

  // One budget across both verification reasons: "missing" that becomes
  // "failing" after the out-of-band run is the same problem being steered.
  const previous = countVerificationNudges(ledger, deployment);
  if (previous >= MAX_NUDGES_PER_DEPLOYMENT) {
    return undefined;
  }

  return { reason, subject: deployment, nudge: previous + 1 };
}

/**
 * The turn-end hook `run-session` calls: decide, re-verify out of band when
 * a manifest exists, decide again on the fresh evidence, and only then
 * journal and return a nudge. Best-effort throughout — steering must never
 * fail the session it is trying to help.
 */
export async function maybeSteerVerification(options: {
  client: Client;
  sessionDir: string;
  /** Injectable for tests; defaults to the real `onboard verify`. */
  runVerify?: (client: Client, argv: string[]) => Promise<number>;
}): Promise<SteeringNudge | undefined> {
  const { client, sessionDir } = options;
  const runVerify = options.runVerify ?? onboardVerify;

  try {
    let ledger = await readLedger(sessionDir);
    let decision = decideSteering(ledger);
    if (!decision) {
      return undefined;
    }

    // Re-run the declared checks before claiming anything is failing: the
    // agent may have fixed the deployment without re-verifying, and a nudge
    // must quote evidence measured after its last action, not before.
    const manifestPresent = await manifestExists(sessionDir);
    if (decision.reason !== 'browser-handoff-pending' && manifestPresent) {
      try {
        await runVerify(client, ['--deployment', decision.subject]);
      } catch (err) {
        output.debug(
          `onboard steering: out-of-band verify failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
      ledger = await readLedger(sessionDir);
      decision = decideSteering(ledger);
      if (!decision) {
        return undefined; // The fresh run passed — nothing to steer.
      }
    }

    const nudge = buildNudge(decision, ledger, sessionDir, manifestPresent);
    recordSessionEvent({
      type: 'verification-steering',
      reason: decision.reason,
      subject: decision.subject,
      nudge: decision.nudge,
    });
    return nudge;
  } catch (err) {
    output.debug(
      `onboard steering: skipped: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return undefined;
  }
}

function buildNudge(
  decision: { reason: SteeringReason; subject: string; nudge: number },
  ledger: LedgerEvent[],
  sessionDir: string,
  manifestPresent: boolean
): SteeringNudge {
  const { reason, subject, nudge } = decision;
  const budget = `nudge ${nudge} of ${MAX_NUDGES_PER_DEPLOYMENT}`;

  if (reason === 'browser-handoff-pending') {
    return {
      reason,
      subject,
      nudge,
      announce: 'Provider setup is waiting on the user in their browser.',
      prompt: [
        '## From the CLI: provider setup is waiting on the user',
        '',
        'The last provisioning command required a browser checkout. The CLI',
        'has surfaced the checkout URL to the user, who completes it in',
        'their own browser — this is not something you can do or retry.',
        '',
        'Do not re-run the provisioning command: a retry can create a',
        'duplicate resource. Continue any work that does not depend on the',
        'resource, or end your turn and say you are waiting for the user to',
        'finish provider setup.',
      ].join('\n'),
    };
  }

  if (reason === 'verification-missing') {
    const manifestPath = join(sessionDir, 'verify.json');
    // Two different problems wear this reason: no manifest was ever
    // written, or one exists but the CLI's own out-of-band run could not
    // produce a recorded verification from it (unreadable, invalid, or
    // pointing nowhere). The instruction must name the one that happened.
    const instruction = manifestPresent
      ? [
          `A manifest exists at ${manifestPath}, but running it did not`,
          'produce a recorded verification — it is unreadable, invalid, or',
          'its checks could not run. Fix the manifest, then run `vercel',
          'onboard verify` and fix whatever fails.',
        ]
      : [
          `Author the verification manifest at ${manifestPath} (checks that`,
          'prove the migrated behavior: routes, data reads and writes,',
          'cross-request persistence), then run `vercel onboard verify` and',
          'fix whatever fails.',
        ];
    return {
      reason,
      subject,
      nudge,
      announce: `No verification recorded for ${subject} — steering the agent (${budget}).`,
      prompt: [
        '## From the CLI: this deployment is not verified',
        '',
        `Deployment: ${subject}`,
        '',
        'No `vercel onboard verify` run has been recorded for this',
        'deployment. The session does not treat a deployment as working',
        'until the CLI has measured it — a successful deploy proves the',
        'build, not the behavior.',
        '',
        ...instruction,
        'Do not report the migration complete before every check passes.',
      ].join('\n'),
    };
  }

  const verification = latestVerificationEvent(ledger, subject);
  const evidence = verification ? describeFailures(verification) : [];
  const protectionBlocked = Boolean(
    verification?.protectionBlocked && verification.protectionBlocked > 0
  );
  const counts = verification
    ? `${verification.failed}/${verification.passed + verification.failed} checks failing`
    : 'checks failing';

  return {
    reason,
    subject,
    nudge,
    announce: `Verification is failing — ${counts} on ${subject}. Steering the agent (${budget}).`,
    prompt: [
      '## From the CLI: verification is failing',
      '',
      `Deployment: ${subject}`,
      '',
      'The CLI just re-ran `vercel onboard verify` out of band. This is the',
      `measured result, not a recollection: ${counts}.`,
      '',
      ...evidence,
      '',
      ...(protectionBlocked
        ? [
            'Some checks are blocked by Vercel Deployment Protection even',
            'after the bypass token was refreshed. That is access control,',
            'not application behavior — do not change application code for',
            'those checks; raise the protection settings with the user.',
          ]
        : [
            'Diagnose the failing behavior, fix it, redeploy if needed, then',
            'run `vercel onboard verify` yourself until every check passes.',
          ]),
      'Do not report the migration complete while verification fails.',
    ].join('\n'),
  };
}

/** The failing checks, quoted verbatim and bounded. */
function describeFailures(verification: VerificationEvent): string[] {
  const failing = verification.checks.filter(check => check.ok === false);
  const lines = failing
    .slice(0, MAX_QUOTED_CHECKS)
    .map(
      check =>
        `- FAIL ${check.method ?? 'GET'} ${check.path ?? '?'} → ${
          check.status ?? 'error'
        }${check.failures?.length ? ` (${check.failures.join('; ')})` : ''}`
    );
  if (failing.length > MAX_QUOTED_CHECKS) {
    lines.push(`- …and ${failing.length - MAX_QUOTED_CHECKS} more`);
  }
  return lines;
}

/** URL of the newest `deployment` event, normalized to an origin. */
function latestDeployment(ledger: LedgerEvent[]): string | undefined {
  for (let i = ledger.length - 1; i >= 0; i--) {
    const event = ledger[i];
    if (event.type === 'deployment' && typeof event.url === 'string') {
      return normalizeOrigin(event.url) ?? event.url;
    }
  }
  return undefined;
}

function latestVerification(
  ledger: LedgerEvent[],
  deployment: string
): { passed: number; failed: number } | undefined {
  const event = latestVerificationEvent(ledger, deployment);
  return event ? { passed: event.passed, failed: event.failed } : undefined;
}

function latestVerificationEvent(
  ledger: LedgerEvent[],
  deployment: string
): VerificationEvent | undefined {
  for (let i = ledger.length - 1; i >= 0; i--) {
    const event = ledger[i];
    if (
      event.type === 'verification' &&
      typeof event.deployment === 'string' &&
      normalizeOrigin(event.deployment) === deployment &&
      typeof event.passed === 'number' &&
      typeof event.failed === 'number'
    ) {
      return {
        deployment,
        passed: event.passed,
        failed: event.failed,
        ...(typeof event.protectionBlocked === 'number'
          ? { protectionBlocked: event.protectionBlocked }
          : {}),
        checks: Array.isArray(event.checks)
          ? (event.checks as VerificationEvent['checks'])
          : [],
      };
    }
  }
  return undefined;
}

/**
 * A browser handoff whose newest status is still `waiting` or `opened` —
 * the user has not finished (or abandoned) the checkout.
 */
function pendingBrowserHandoff(ledger: LedgerEvent[]): string | undefined {
  const latestByUrl = new Map<string, string>();
  for (const event of ledger) {
    if (
      event.type === 'browser-handoff' &&
      typeof event.url === 'string' &&
      typeof event.status === 'string'
    ) {
      latestByUrl.set(event.url, event.status);
    }
  }
  for (const [url, status] of latestByUrl) {
    if (status === 'waiting' || status === 'opened') {
      return url;
    }
  }
  return undefined;
}

function countVerificationNudges(
  ledger: LedgerEvent[],
  subject: string
): number {
  return ledger.filter(
    event =>
      event.type === 'verification-steering' &&
      event.subject === subject &&
      (event.reason === 'verification-failed' ||
        event.reason === 'verification-missing')
  ).length;
}

function countHandoffNudges(ledger: LedgerEvent[], subject: string): number {
  return ledger.filter(
    event =>
      event.type === 'verification-steering' &&
      event.subject === subject &&
      event.reason === 'browser-handoff-pending'
  ).length;
}

async function manifestExists(sessionDir: string): Promise<boolean> {
  try {
    await access(join(sessionDir, 'verify.json'));
    return true;
  } catch {
    return false;
  }
}

function normalizeOrigin(input: string): string | undefined {
  try {
    return new URL(input).origin;
  } catch {
    return undefined;
  }
}
