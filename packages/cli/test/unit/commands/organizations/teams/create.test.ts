import { describe, expect, it, vi } from 'vitest';
import { client } from '../../../../mocks/client';
import {
  org,
  team,
  run,
  runExpectingAgentExit,
  jsonOutput,
  setupOrganizationsTest,
} from '../helpers';

setupOrganizationsTest();

describe('organizations teams create', () => {
  it('creates an Enterprise child with the API create mode', async () => {
    client.scenario.post(
      `/v1/organizations/${org.organizationId}/teams`,
      (req, res) => {
        expect(req.query).toEqual({});
        expect(req.body).toEqual({
          mode: 'create',
          slug: 'acme-web',
          name: 'Acme Web',
          billingPlan: 'enterprise',
        });
        res.json({ ...team, billingPlan: 'enterprise' });
      }
    );
    expect(
      await run(
        'teams',
        'create',
        org.organizationId,
        '--slug',
        'acme-web',
        '--name',
        'Acme Web',
        '--billing-plan',
        'enterprise',
        '--format',
        'json',
        '--yes'
      )
    ).toBe(0);
    expect(jsonOutput()).toMatchObject({
      team: { billingPlan: 'enterprise' },
      outcome: 'created',
    });
  });

  it('requires --name', async () => {
    expect(
      await runExpectingAgentExit(
        'teams',
        'create',
        org.organizationId,
        '--slug',
        'acme-web',
        '--non-interactive'
      )
    ).toMatchObject({
      status: 'action_required',
      reason: 'missing_arguments',
    });
  });

  it('rejects an unknown billing plan', async () => {
    expect(
      await runExpectingAgentExit(
        'teams',
        'create',
        org.organizationId,
        '--slug',
        'acme-web',
        '--name',
        'Acme Web',
        '--billing-plan',
        'gold',
        '--non-interactive'
      )
    ).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
  });

  it('states the enterprise billing terms before it asks', async () => {
    const confirm = vi.spyOn(client.input, 'confirm').mockResolvedValue(true);
    client.scenario.post(
      `/v1/organizations/${org.organizationId}/teams`,
      (_req, res) => res.json({ ...team, billingPlan: 'enterprise' })
    );
    expect(
      await run(
        'teams',
        'create',
        org.organizationId,
        '--slug',
        'acme-web',
        '--name',
        'Acme Web',
        '--billing-plan',
        'enterprise'
      )
    ).toBe(0);
    expect(confirm).toHaveBeenCalledWith(
      `Create team acme-web billed through organization ${org.organizationId}?`,
      false
    );
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      "Creates team acme-web. Its usage is billed on the root team's Enterprise subscription."
    );
    expect(stderr).toContain('✓ Created');
    // A new team has no projects to move.
    expect(stderr).not.toContain('in the background');
  });

  it('requires --yes when it cannot prompt', async () => {
    const post = vi.fn();
    client.scenario.post(`/v1/organizations/${org.organizationId}/teams`, post);
    expect(
      await runExpectingAgentExit(
        'teams',
        'create',
        org.organizationId,
        '--slug',
        'acme-web',
        '--name',
        'Acme Web',
        '--non-interactive'
      )
    ).toMatchObject({
      status: 'action_required',
      reason: 'confirmation_required',
      userActionRequired: true,
      data: {
        effects: [
          "Creates team acme-web. Its usage is billed through the organization's root team.",
        ],
      },
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('reports a taken slug as a conflict', async () => {
    client.scenario.post(
      `/v1/organizations/${org.organizationId}/teams`,
      (_req, res) =>
        res.status(409).json({
          error: { code: 'slug_conflict', message: 'The slug is taken' },
        })
    );
    expect(
      await runExpectingAgentExit(
        'teams',
        'create',
        org.organizationId,
        '--slug',
        'acme-web',
        '--name',
        'Acme Web',
        '--yes',
        '--non-interactive'
      )
    ).toMatchObject({
      reason: 'conflict',
      message: `Can't create team acme-web in organization ${org.organizationId}. Another team uses this slug.`,
    });
  });

  it('reports a root team on the wrong plan as a plan limit', async () => {
    client.scenario.post(
      `/v1/organizations/${org.organizationId}/teams`,
      (_req, res) =>
        res.status(400).json({
          error: {
            code: 'invalid_billing_plan',
            message: 'Root team plan is not supported',
          },
        })
    );
    expect(
      await runExpectingAgentExit(
        'teams',
        'create',
        org.organizationId,
        '--slug',
        'acme-web',
        '--name',
        'Acme Web',
        '--yes',
        '--non-interactive'
      )
    ).toMatchObject({
      reason: 'plan_limit',
      message: `Can't create team acme-web in organization ${org.organizationId}. The team's billing plan doesn't allow it.`,
      data: { remoteMessage: 'Root team plan is not supported' },
    });
  });
});
