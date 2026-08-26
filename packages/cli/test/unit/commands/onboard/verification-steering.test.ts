import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { client } from '../../../mocks/client';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';
import { readLedger } from '../../../../src/util/onboard-session';
import {
  decideSteering,
  maybeSteerVerification,
} from '../../../../src/commands/onboard/verification-steering';
import type { LedgerEvent } from '../../../../src/util/onboard-session';

const DEPLOY = 'https://app-abc.vercel.app';

function deployment(url = DEPLOY): LedgerEvent {
  return { type: 'deployment', url, target: 'preview' };
}

function verification(
  overrides: Partial<{
    deployment: string;
    passed: number;
    failed: number;
    protectionBlocked: number;
    checks: object[];
  }> = {}
): LedgerEvent {
  return {
    type: 'verification',
    deployment: DEPLOY,
    passed: 3,
    failed: 0,
    checks: [],
    ...overrides,
  };
}

function steeringEvent(
  reason: string,
  subject = DEPLOY,
  nudge = 1
): LedgerEvent {
  return { type: 'verification-steering', reason, subject, nudge };
}

describe('decideSteering', () => {
  it('does not nudge before anything is deployed', () => {
    expect(decideSteering([])).toBeUndefined();
    expect(decideSteering([verification({ failed: 2 })])).toBeUndefined();
  });

  it('nudges when the latest deployment has no verification', () => {
    expect(decideSteering([deployment()])).toEqual({
      reason: 'verification-missing',
      subject: DEPLOY,
      nudge: 1,
    });
  });

  it('nudges when the latest verification is failing', () => {
    const decision = decideSteering([
      deployment(),
      verification({ passed: 4, failed: 3 }),
    ]);
    expect(decision).toEqual({
      reason: 'verification-failed',
      subject: DEPLOY,
      nudge: 1,
    });
  });

  it('does not nudge when the latest verification passes', () => {
    expect(
      decideSteering([
        deployment(),
        verification({ failed: 2 }),
        verification({ failed: 0 }),
      ])
    ).toBeUndefined();
  });

  it('a verification for another deployment does not count', () => {
    const decision = decideSteering([
      deployment('https://old.vercel.app'),
      verification({ deployment: 'https://old.vercel.app', failed: 0 }),
      deployment(),
    ]);
    expect(decision).toMatchObject({ reason: 'verification-missing' });
  });

  it('shares one bounded budget across missing and failed reasons', () => {
    const base = [deployment(), verification({ failed: 1 })];
    expect(
      decideSteering([...base, steeringEvent('verification-missing')])
    ).toMatchObject({ nudge: 2 });
    expect(
      decideSteering([
        ...base,
        steeringEvent('verification-missing', DEPLOY, 1),
        steeringEvent('verification-failed', DEPLOY, 2),
      ])
    ).toBeUndefined();
  });

  it('resets the budget for a new deployment', () => {
    const spent = [
      deployment('https://old.vercel.app'),
      steeringEvent('verification-failed', 'https://old.vercel.app', 1),
      steeringEvent('verification-failed', 'https://old.vercel.app', 2),
      deployment(),
    ];
    expect(decideSteering(spent)).toMatchObject({
      reason: 'verification-missing',
      subject: DEPLOY,
      nudge: 1,
    });
  });

  it('a pending browser handoff outranks verification, once', () => {
    const handoff: LedgerEvent = {
      type: 'browser-handoff',
      url: 'https://vercel.com/checkout/x',
      status: 'waiting',
    };
    expect(decideSteering([deployment(), handoff])).toMatchObject({
      reason: 'browser-handoff-pending',
      subject: 'https://vercel.com/checkout/x',
    });
    // Completed handoffs stop mattering.
    expect(
      decideSteering([
        deployment(),
        handoff,
        { ...handoff, status: 'completed' },
      ])
    ).toMatchObject({ reason: 'verification-missing' });
    // And one handoff nudge is the budget.
    expect(
      decideSteering([
        handoff,
        steeringEvent(
          'browser-handoff-pending',
          'https://vercel.com/checkout/x'
        ),
      ])
    ).toBeUndefined();
  });
});

describe('maybeSteerVerification', () => {
  let cwd: string;
  let sessionDir: string;

  beforeEach(() => {
    cwd = setupTmpDir();
    client.cwd = cwd;
    sessionDir = join(cwd, '.session');
    mkdirSync(sessionDir, { recursive: true });
    process.env.VERCEL_ONBOARD_SESSION_DIR = sessionDir;
  });

  afterEach(() => {
    delete process.env.VERCEL_ONBOARD_SESSION_DIR;
  });

  function writeLedger(events: LedgerEvent[]): void {
    writeFileSync(
      join(sessionDir, 'ledger.ndjson'),
      events.map(event => JSON.stringify(event)).join('\n') + '\n'
    );
  }

  it('returns nothing when there is nothing to steer', async () => {
    writeLedger([deployment(), verification({ failed: 0 })]);
    const nudge = await maybeSteerVerification({ client, sessionDir });
    expect(nudge).toBeUndefined();
  });

  it('re-runs the manifest out of band and stays quiet when it now passes', async () => {
    writeLedger([deployment(), verification({ failed: 2 })]);
    writeFileSync(join(sessionDir, 'verify.json'), '{"checks":[{"path":"/"}]}');

    // The injected verify journals a passing result, as the real one would.
    const runVerify = vi.fn(async () => {
      appendFileSync(
        join(sessionDir, 'ledger.ndjson'),
        JSON.stringify(verification({ failed: 0 })) + '\n'
      );
      return 0;
    });

    const nudge = await maybeSteerVerification({
      client,
      sessionDir,
      runVerify,
    });
    expect(runVerify).toHaveBeenCalledWith(client, ['--deployment', DEPLOY]);
    expect(nudge).toBeUndefined();
    // No steering event journaled: nothing was steered.
    const ledger = await readLedger(sessionDir);
    expect(ledger.some(event => event.type === 'verification-steering')).toBe(
      false
    );
  });

  it('nudges with the freshly measured failing checks', async () => {
    writeLedger([deployment()]);
    writeFileSync(join(sessionDir, 'verify.json'), '{"checks":[{"path":"/"}]}');

    const runVerify = vi.fn(async () => {
      appendFileSync(
        join(sessionDir, 'ledger.ndjson'),
        JSON.stringify(
          verification({
            passed: 1,
            failed: 1,
            checks: [
              { method: 'GET', path: '/ok', ok: true, status: 200 },
              {
                method: 'GET',
                path: '/api/todos',
                ok: false,
                status: 500,
                failures: ['status 500 (expected 200)'],
              },
            ],
          })
        ) + '\n'
      );
      return 1;
    });

    const nudge = await maybeSteerVerification({
      client,
      sessionDir,
      runVerify,
    });
    expect(nudge).toMatchObject({ reason: 'verification-failed', nudge: 1 });
    expect(nudge?.prompt).toContain(
      'FAIL GET /api/todos → 500 (status 500 (expected 200))'
    );
    expect(nudge?.prompt).toContain('1/2 checks failing');
    expect(nudge?.prompt).not.toContain('/ok');

    // The nudge itself is journaled, so the budget survives continuation.
    const ledger = await readLedger(sessionDir);
    const steered = ledger.filter(
      event => event.type === 'verification-steering'
    );
    expect(steered).toHaveLength(1);
    expect(steered[0]).toMatchObject({
      reason: 'verification-failed',
      subject: DEPLOY,
      nudge: 1,
    });
  });

  it('nudges to author the manifest when none exists', async () => {
    writeLedger([deployment()]);
    const runVerify = vi.fn();

    const nudge = await maybeSteerVerification({
      client,
      sessionDir,
      runVerify,
    });
    expect(runVerify).not.toHaveBeenCalled();
    expect(nudge).toMatchObject({ reason: 'verification-missing' });
    expect(nudge?.prompt).toContain('Author the verification manifest');
    expect(nudge?.prompt).toContain('verify.json');
  });

  it('nudges to fix the manifest when it exists but records nothing', async () => {
    writeLedger([deployment()]);
    writeFileSync(join(sessionDir, 'verify.json'), '{ not valid json');

    // The out-of-band run fails before journaling anything, as the real
    // command does on an unreadable manifest.
    const runVerify = vi.fn(async () => 1);

    const nudge = await maybeSteerVerification({
      client,
      sessionDir,
      runVerify,
    });
    expect(runVerify).toHaveBeenCalledTimes(1);
    expect(nudge).toMatchObject({ reason: 'verification-missing' });
    expect(nudge?.prompt).toContain('running it did not');
    expect(nudge?.prompt).not.toContain('Author the verification manifest');
  });

  it('names Deployment Protection instead of blaming the app', async () => {
    writeLedger([
      deployment(),
      verification({
        passed: 0,
        failed: 2,
        protectionBlocked: 2,
        checks: [
          {
            method: 'GET',
            path: '/',
            ok: false,
            status: 302,
            failures: ['blocked by Vercel Deployment Protection'],
          },
        ],
      }),
    ]);

    const nudge = await maybeSteerVerification({ client, sessionDir });
    expect(nudge?.prompt).toContain('Deployment Protection');
    expect(nudge?.prompt).toContain('do not change application code');
  });

  it('exhausts the budget after two nudges and goes quiet', async () => {
    writeLedger([deployment(), verification({ failed: 1 })]);

    const first = await maybeSteerVerification({ client, sessionDir });
    expect(first).toMatchObject({ nudge: 1 });
    const second = await maybeSteerVerification({ client, sessionDir });
    expect(second).toMatchObject({ nudge: 2 });
    const third = await maybeSteerVerification({ client, sessionDir });
    expect(third).toBeUndefined();
  });

  it('steers away from retrying provisioning during a pending handoff', async () => {
    writeLedger([
      {
        type: 'browser-handoff',
        url: 'https://vercel.com/checkout/x',
        status: 'waiting',
      },
    ]);

    const runVerify = vi.fn();
    const nudge = await maybeSteerVerification({
      client,
      sessionDir,
      runVerify,
    });
    expect(runVerify).not.toHaveBeenCalled();
    expect(nudge).toMatchObject({ reason: 'browser-handoff-pending' });
    expect(nudge?.prompt).toContain('Do not re-run the provisioning command');
  });
});
