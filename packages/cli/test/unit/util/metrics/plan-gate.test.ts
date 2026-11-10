import { afterEach, describe, expect, it } from 'vitest';
import type { Team } from '@vercel-internals/types';
import type Client from '../../../../src/util/client';
import { teamCache } from '../../../../src/util/teams/get-team-by-id-or-slug';
import {
  mentionsObservabilityPlus,
  mentionsPriorityProject,
  observabilityPlusDenialReason,
  observabilityPlusPurchaseFix,
  observabilityPlusRecovery,
  observabilityPlanRecovery,
  priorityProjectRecovery,
  clientObservabilityPlanRecovery,
  OBSERVABILITY_PLUS_PURCHASE_COMMAND,
  PRIORITY_PROJECT_ENABLE_COMMAND,
  BUY_PRO_COMMAND,
  targetRecovery,
} from '../../../../src/util/metrics/plan-gate';
import { APIError } from '../../../../src/util/errors-ts';
import type { Response } from '../../../../src/util/fetch';

function apiError(message: string, meta?: { reason: string }) {
  return new APIError(
    message,
    { status: 402, headers: { get: () => null } } as unknown as Response,
    {
      ...(meta ? { meta } : {}),
    }
  );
}

describe('mentionsObservabilityPlus', () => {
  it('recognizes the API refusal and our own fallback wording', () => {
    // The observability API's string, and the two the CLI falls back to when
    // the response carried no message.
    expect(
      mentionsObservabilityPlus(
        'Observability Plus is required for this query.'
      )
    ).toBe(true);
    expect(
      mentionsObservabilityPlus('Traffic and alerts need Observability Plus.')
    ).toBe(true);
    expect(
      mentionsObservabilityPlus(
        'This feature requires an Observability Plus subscription.'
      )
    ).toBe(true);
  });

  it('does not recognize another product refused with the same status', () => {
    // Every paid product on `/metrics/v1` answers 402 with
    // `code: 'payment_required'`, so the status cannot pick these apart and
    // the message is the only thing that can.
    expect(
      mentionsObservabilityPlus(
        'Accessing Analytics custom events requires an Enterprise or Pro plan.'
      )
    ).toBe(false);
    expect(
      mentionsObservabilityPlus(
        'The pro plan grants access to the latest 30 days of Web Analytics data.'
      )
    ).toBe(false);
  });

  it('does not read a spent query quota as a missing subscription', () => {
    // Shares the word "observability" and the 402, but a second subscription
    // does not raise the limit.
    expect(
      mentionsObservabilityPlus(
        'You have reached the daily observability metrics query limit for your team. Request a higher usage limit from your Vercel account team.'
      )
    ).toBe(false);
  });
});

describe('mentionsPriorityProject', () => {
  it('recognizes the current copy and the leftover Priority Tier string', () => {
    expect(
      mentionsPriorityProject('A Priority project is required for this query.')
    ).toBe(true);
    expect(
      mentionsPriorityProject('Priority Tier is required for this query.')
    ).toBe(true);
  });

  it('does not treat Observability Plus as Priority', () => {
    expect(
      mentionsPriorityProject('Observability Plus is required for this query.')
    ).toBe(false);
  });
});

describe('observabilityPlusPurchaseFix', () => {
  it('offers the command the CLI can complete, and says who approves it', () => {
    const fix = observabilityPlusPurchaseFix();
    expect(fix.command).toEqual(OBSERVABILITY_PLUS_PURCHASE_COMMAND);
    expect(fix.hint).toContain(OBSERVABILITY_PLUS_PURCHASE_COMMAND);
    // An agent reading `next[]` should know a person has to approve a
    // billing change; the command itself refuses without `--yes`.
    expect(fix.when).toContain('approved');
  });
});

describe('observabilityPlusRecovery', () => {
  it('treats the /metrics/v1 402 as a missing subscription', () => {
    // Firewall traffic and metrics both hit this endpoint. It does not set
    // meta.reason, so the short string is the only signal.
    const recovery = observabilityPlusRecovery(
      'Observability Plus is required for this query.'
    );
    expect(recovery?.command).toEqual(OBSERVABILITY_PLUS_PURCHASE_COMMAND);
    expect(recovery?.hint).toMatch(/disabled|already subscribed/i);
  });

  it('does not sell a subscription when Plus was disabled', () => {
    const recovery = observabilityPlusRecovery(
      'Observability Plus was disabled for team acme. Re-enable it to run this query. Learn more: https://vercel.com/docs/observability/observability-plus'
    );
    expect(recovery?.command).toBeUndefined();
    expect(recovery?.hint).toMatch(/disabled/i);
    expect(recovery?.hint).not.toContain(OBSERVABILITY_PLUS_PURCHASE_COMMAND);
  });

  it('points an excluded project at project enable, not a purchase', () => {
    const recovery = observabilityPlusRecovery(
      'Observability Plus is enabled for team acme, but this project is excluded from it. Include the project in Observability Plus to query its data. Learn more: https://vercel.com/docs/observability/observability-plus'
    );
    expect(recovery?.command).toEqual('project observability enable');
    expect(recovery?.excludeFlags).toEqual(
      expect.arrayContaining(['--non-interactive', '--yes'])
    );
    expect(recovery?.hint).not.toContain(OBSERVABILITY_PLUS_PURCHASE_COMMAND);
  });

  it('points Hobby at buy pro rather than the add-on', () => {
    const recovery = observabilityPlusRecovery(
      'Observability Plus is required for this query.',
      undefined,
      'hobby'
    );
    expect(recovery?.command).toEqual(BUY_PRO_COMMAND);
    expect(recovery?.hint).toContain(BUY_PRO_COMMAND);
    expect(recovery?.hint).not.toContain(OBSERVABILITY_PLUS_PURCHASE_COMMAND);
    expect(recovery?.when).toMatch(/approved/);
  });

  it('does not offer the add-on when the plan cannot buy it', () => {
    const recovery = observabilityPlusRecovery(
      'Observability Plus is required to run this query for team acme and is available on Pro and Enterprise plans. Upgrade your plan to continue. Learn more: https://vercel.com/docs/observability/observability-plus'
    );
    expect(recovery?.command).toEqual(BUY_PRO_COMMAND);
    expect(recovery?.hint).toContain(BUY_PRO_COMMAND);
    expect(recovery?.hint).not.toContain(OBSERVABILITY_PLUS_PURCHASE_COMMAND);
  });

  it('prefers meta.reason over the message', () => {
    const error = apiError('Observability Plus is required for this query.', {
      reason: 'project_excluded',
    });
    expect(observabilityPlusDenialReason(error)).toEqual('project_excluded');
    const recovery = observabilityPlusRecovery(
      error.serverMessage,
      observabilityPlusDenialReason(error)
    );
    expect(recovery?.command).toEqual('project observability enable');
  });

  it('ignores generic plan reasons when the message did not name Observability Plus', () => {
    const recovery = observabilityPlusRecovery(
      'This feature requires a higher plan.',
      'plan_upgrade_required'
    );
    expect(recovery).toBeUndefined();
  });
});

describe('priorityProjectRecovery', () => {
  it('names the interactive enable command and does not offer --yes', () => {
    const recovery = priorityProjectRecovery(
      'A Priority project is required for this query.'
    );
    expect(recovery?.command).toEqual(PRIORITY_PROJECT_ENABLE_COMMAND);
    expect(recovery?.hint).toContain(PRIORITY_PROJECT_ENABLE_COMMAND);
    expect(recovery?.hint).not.toContain('A person must');
    expect(recovery?.hint).not.toContain('--yes');
    expect(recovery?.when).toContain('interactive terminal');
  });

  it('sends Hobby to buy pro while still naming Priority', () => {
    const recovery = priorityProjectRecovery(
      'A Priority project is required for this query.',
      'hobby'
    );
    expect(recovery?.command).toEqual(BUY_PRO_COMMAND);
    expect(recovery?.hint).toContain(
      'Priority Projects are only available on Pro or Enterprise team plans.'
    );
    expect(recovery?.hint).toContain(BUY_PRO_COMMAND);
    expect(recovery?.hint).toContain(PRIORITY_PROJECT_ENABLE_COMMAND);
    expect(recovery?.hint).not.toContain(OBSERVABILITY_PLUS_PURCHASE_COMMAND);
    expect(recovery?.when).toMatch(/approved/);
  });

  it('uses the Priority enable handoff unless the CLI knows the plan is Hobby', () => {
    const recovery = priorityProjectRecovery(
      'Priority Projects are only available on Pro or Enterprise team plans.'
    );
    expect(recovery?.command).toEqual(PRIORITY_PROJECT_ENABLE_COMMAND);
    expect(recovery?.hint).not.toContain(BUY_PRO_COMMAND);
    expect(recovery?.hint).toContain(PRIORITY_PROJECT_ENABLE_COMMAND);
  });
});

describe('observabilityPlanRecovery', () => {
  it('does not sell Observability Plus for a Priority refusal', () => {
    const recovery = observabilityPlanRecovery(
      'A Priority project is required for this query.'
    );
    expect(recovery?.command).toEqual(PRIORITY_PROJECT_ENABLE_COMMAND);
    expect(recovery?.hint).not.toContain(OBSERVABILITY_PLUS_PURCHASE_COMMAND);
  });

  it('still offers Plus when that is what the API named', () => {
    const recovery = observabilityPlanRecovery(
      'Observability Plus is required for this query.'
    );
    expect(recovery?.command).toEqual(OBSERVABILITY_PLUS_PURCHASE_COMMAND);
  });

  it('does not sell two products: Hobby Plus is buy pro, not enable', () => {
    const recovery = observabilityPlanRecovery(
      'Observability Plus is required for this query.',
      undefined,
      'hobby'
    );
    expect(recovery?.command).toEqual(BUY_PRO_COMMAND);
    expect(recovery?.hint).not.toContain(PRIORITY_PROJECT_ENABLE_COMMAND);
    expect(recovery?.hint).not.toContain(OBSERVABILITY_PLUS_PURCHASE_COMMAND);
  });

  it('does not infer an Observability product from a generic plan reason', () => {
    const recovery = observabilityPlanRecovery(
      'This feature requires a higher plan.',
      'plan_upgrade_required'
    );
    expect(recovery).toBeUndefined();
  });
});

describe('targetRecovery', () => {
  it('names the project and team on enable, in the command and the hint', () => {
    const fix = targetRecovery(
      priorityProjectRecovery('A Priority project is required.', 'pro'),
      { projectName: 'my app', scope: 'acme' }
    );
    expect(fix?.command).toBe("project priority enable 'my app' --scope acme");
    expect(fix?.hint).toContain(
      "project priority enable 'my app' --scope acme"
    );
    expect(fix?.excludeFlags).toEqual(
      expect.arrayContaining(['--project', '--scope', '--team'])
    );
    expect(fix?.preserveProject).toBe(false);
  });

  it('scopes buy pro without giving it a project', () => {
    const fix = targetRecovery(
      priorityProjectRecovery('A Priority project is required.', 'hobby'),
      { projectName: 'web', scope: 'acme' }
    );
    expect(fix?.command).toBe('buy pro --scope acme');
    expect(fix?.hint).toContain('buy pro --scope acme');
    expect(fix?.hint).toContain('project priority enable web --scope acme');
    expect(fix?.excludeFlags).toEqual(
      expect.arrayContaining(['--project', '--scope', '--team'])
    );
  });

  it('leaves a recovery alone when there is no team or project', () => {
    const fix = priorityProjectRecovery(
      'A Priority project is required.',
      'pro'
    );
    expect(targetRecovery(fix, {})).toEqual(fix);
  });
});

describe('clientObservabilityPlanRecovery', () => {
  const hobby = {
    id: 'team_hobby',
    slug: 'hobby-team',
    billing: { plan: 'hobby' },
  } as Team;
  const pro = {
    id: 'team_pro',
    slug: 'pro-team',
    billing: { plan: 'pro' },
  } as Team;

  function cacheTeam(team: Team) {
    teamCache.set(team.id, team);
    teamCache.set(team.slug, team);
  }

  afterEach(() => {
    for (const key of [
      hobby.id,
      hobby.slug,
      pro.id,
      pro.slug,
      'uncached-team',
    ]) {
      teamCache.delete(key);
    }
  });

  it('uses the queried team plan when that team is cached', () => {
    cacheTeam(hobby);
    cacheTeam(pro);
    const fix = clientObservabilityPlanRecovery(
      { config: { currentTeam: pro.id } } as Client,
      apiError('Observability Plus is required for this query.'),
      'Observability Plus is required for this query.',
      'linked-app',
      hobby.slug
    );
    expect(fix?.command).toBe('buy pro --scope hobby-team');
  });

  it('does not inherit the selected team plan when the queried team is uncached', () => {
    cacheTeam(hobby);
    const fix = clientObservabilityPlanRecovery(
      { config: { currentTeam: hobby.id } } as Client,
      apiError('Observability Plus is required for this query.'),
      'Observability Plus is required for this query.',
      undefined,
      'uncached-team'
    );
    expect(fix?.command).toBe(
      'buy addon observability-plus --scope uncached-team'
    );
  });
});
