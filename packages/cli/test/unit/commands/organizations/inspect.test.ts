import { describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import {
  org,
  run,
  runExpectingAgentExit,
  jsonOutput,
  setupOrganizationsTest,
} from './helpers';

setupOrganizationsTest();

describe('organizations inspect', () => {
  it('inspects an organization and retains optional legacy fields', async () => {
    const { name: _name, ...legacyOrg } = org;
    client.config.currentTeam = 'team_unrelated';
    client.scenario.get(
      `/v1/organizations/${org.organizationId}`,
      (req, res) => {
        expect(req.query).toEqual({});
        res.json(legacyOrg);
      }
    );
    expect(await run('inspect', org.organizationId, '--format', 'json')).toBe(
      0
    );
    expect(jsonOutput()).toEqual({ organization: legacyOrg });
  });

  // Format and interaction are separate settings, so a non-interactive run
  // without --json gets the human view. The detail view is the answer, so it
  // goes to stdout.
  it('prints the human view for a non-interactive run', async () => {
    client.scenario.get(
      `/v1/organizations/${org.organizationId}`,
      (_req, res) => res.json(org)
    );
    expect(await run('inspect', org.organizationId, '--non-interactive')).toBe(
      0
    );
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain('Organization ID');
    expect(stdout).toContain(org.organizationId);
    expect(client.stderr.getFullOutput()).not.toContain('Organization ID');
  });

  it('rejects a bare organization ID prefix before any request', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(
      await runExpectingAgentExit('inspect', 'org_', '--non-interactive')
    ).toMatchObject({ status: 'error', reason: 'invalid_arguments' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires a target when no team is selected', async () => {
    client.config.currentTeam = undefined;
    expect(
      await runExpectingAgentExit('inspect', '--non-interactive')
    ).toMatchObject({
      status: 'action_required',
      reason: 'missing_arguments',
    });
  });

  // The organization resource carries the root team's ID but not its slug.
  it('names the root team in the human view', async () => {
    client.scenario.get(
      `/v1/organizations/${org.organizationId}`,
      (_req, res) => res.json(org)
    );
    client.scenario.get(`/teams/${org.teamId}`, (_req, res) =>
      res.json({ id: org.teamId, slug: 'acme-root', name: 'Acme' })
    );
    expect(await run('inspect', org.organizationId, '--no-color')).toBe(0);
    expect(client.stdout.getFullOutput()).toContain(
      `acme-root (${org.teamId})`
    );
  });

  it('falls back to the root team ID when the lookup fails', async () => {
    client.scenario.get(
      `/v1/organizations/${org.organizationId}`,
      (_req, res) => res.json(org)
    );
    client.scenario.get(`/teams/${org.teamId}`, (_req, res) =>
      res.status(403).json({ error: { code: 'forbidden', message: 'No' } })
    );
    expect(await run('inspect', org.organizationId, '--no-color')).toBe(0);
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain(org.teamId);
    expect(stdout).not.toContain('acme-root');
  });

  it('skips the root team lookup for machine output', async () => {
    client.scenario.get(
      `/v1/organizations/${org.organizationId}`,
      (_req, res) => res.json(org)
    );
    expect(await run('inspect', org.organizationId, '--format', 'json')).toBe(
      0
    );
    expect(jsonOutput()).toEqual({ organization: org });
  });

  // Permission and missing-resource failures stay distinct from generic API
  // failures, so an agent can branch on `reason` alone.
  it.each([
    { status: 401, reason: 'api_error' },
    { status: 403, reason: 'permission_denied' },
    { status: 404, reason: 'not_found' },
    { status: 409, reason: 'conflict' },
  ])('reports a $status as $reason', async ({ status, reason }) => {
    client.scenario.get(
      `/v1/organizations/${org.organizationId}`,
      (_req, res) =>
        res.status(status).json({
          error: { code: 'not_authorized', message: 'Not authorized' },
        })
    );
    expect(
      await runExpectingAgentExit(
        'inspect',
        org.organizationId,
        '--non-interactive'
      )
    ).toMatchObject({ status: 'error', reason });
  });
});
