import { describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { TEAM_NOT_CHOSEN } from '../../../../src/util/client';
import {
  org,
  run,
  runExpectingAgentExit,
  jsonOutput,
  setupOrganizationsTest,
} from './helpers';

setupOrganizationsTest();

/** Registers `GET /teams/:id` for the team the active scope points at. */
function useScopeTeam(
  id: string,
  fields: { slug?: string; parentId?: string } = {}
) {
  client.config.currentTeam = id;
  client.scenario.get(`/teams/${id}`, (_req, res) =>
    res.json({
      id,
      slug: fields.slug ?? 'acme-web',
      name: 'Acme Web',
      avatar: null,
      parentId: fields.parentId,
    })
  );
}

function useOrganization() {
  client.scenario.get(`/v1/organizations/${org.organizationId}`, (req, res) => {
    // The organization target never inherits the active team.
    expect(req.query).toEqual({});
    res.json(org);
  });
}

describe('organization target resolution', () => {
  it('uses an explicit organization ID without extra lookups', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    useOrganization();
    expect(await run('inspect', org.organizationId, '--format', 'json')).toBe(
      0
    );
    expect(jsonOutput()).toEqual({ organization: org });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  // The list call already backs `organizations list`.
  it('resolves a slug through the organization list', async () => {
    client.scenario.get('/v1/organizations', (_req, res) =>
      res.json({ organizations: [org] })
    );
    useOrganization();
    expect(await run('inspect', org.slug, '--format', 'json')).toBe(0);
    expect(jsonOutput()).toEqual({ organization: org });
  });

  it('reports an unknown slug without calling the organization endpoint', async () => {
    client.scenario.get('/v1/organizations', (_req, res) =>
      res.json({ organizations: [] })
    );
    expect(
      await runExpectingAgentExit('inspect', 'missing-org', '--non-interactive')
    ).toMatchObject({
      status: 'error',
      reason: 'not_found',
      message: "Couldn't find organization missing-org.",
      next: [{ command: 'vercel organizations list' }],
    });
  });

  // `team.parentId` is the organization ID, and the API sets it on the root
  // team and on every child, so one lookup answers for both.
  it.each([
    ['team_root', 'the root team'],
    ['team_child', 'a child team'],
  ])('resolves the organization from %s (%s) when no target is given', async teamId => {
    useScopeTeam(teamId, { parentId: org.organizationId });
    useOrganization();
    expect(await run('inspect', '--format', 'json')).toBe(0);
    expect(jsonOutput()).toEqual({ organization: org });
  });

  it('reports a scope team outside any organization', async () => {
    useScopeTeam('team_solo', { slug: 'solo' });
    expect(
      await runExpectingAgentExit('inspect', '--non-interactive')
    ).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message:
        'Team solo does not belong to an organization. Provide an organization ID or slug.',
    });
  });

  it('asks for a target when no team is selected', async () => {
    client.config.currentTeam = undefined;
    const payload = await runExpectingAgentExit('inspect', '--non-interactive');
    // The caller can add the target, so no human needs to act. The list
    // command finds the organization.
    expect(payload).not.toHaveProperty('userActionRequired');
    expect(payload.next[0]).toMatchObject({
      command: expect.stringContaining('organizations list'),
    });
    expect(payload).toMatchObject({
      status: 'action_required',
      action: 'missing_arguments',
      reason: 'missing_arguments',
      message:
        'Provide an organization ID or slug, or select an organization team with --scope.',
    });
  });

  it('rejects a target that is neither an ID nor a slug', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(
      await runExpectingAgentExit('inspect', 'Not A Slug', '--non-interactive')
    ).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: expect.stringContaining('Provide an organization ID or slug.'),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects more than one target', async () => {
    expect(
      await runExpectingAgentExit(
        'inspect',
        org.organizationId,
        'extra',
        '--non-interactive'
      )
    ).toMatchObject({ status: 'error', reason: 'invalid_arguments' });
  });

  it.each([
    ['update', ['--slug', 'renamed']],
    ['teams', ['list']],
  ])('resolves the same way for %s', async (subcommand, extra) => {
    useScopeTeam('team_child', { parentId: org.organizationId });
    client.scenario.patch(
      `/v1/organizations/${org.organizationId}`,
      (_req, res) => res.json(org)
    );
    client.scenario.get(
      `/v1/organizations/${org.organizationId}/teams`,
      (_req, res) => res.json({ teams: [] })
    );
    const args =
      subcommand === 'teams'
        ? ['teams', ...extra.slice(0), '--format', 'json']
        : [subcommand, ...extra, '--format', 'json'];
    expect(await run(...args)).toBe(0);
  });

  // A slug target costs a request, so every local flag is checked first.
  it.each([
    [['update', 'acme', '--slug', 'Not A Slug'], 'invalid_arguments'],
    [['teams', 'create', 'acme', '--slug', 'acme-web'], 'missing_arguments'],
    [
      ['teams', 'add', 'acme', '--child-team', 'Not A Team'],
      'invalid_arguments',
    ],
    [['teams', 'add', 'acme', '--child-team', 'team_'], 'invalid_arguments'],
  ])('checks the flags of %j before resolving the target', async (args, reason) => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(
      await runExpectingAgentExit(...args, '--non-interactive')
    ).toMatchObject({ reason });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('organizations create root team', () => {
  it('uses the active team as the root team', async () => {
    client.config.currentTeam = 'team_root';
    client.scenario.post('/v1/organizations', (req, res) => {
      expect(req.query).toEqual({ teamId: 'team_root' });
      res.json(org);
    });
    expect(await run('create', '--slug', org.slug, '--format', 'json')).toBe(0);
    expect(jsonOutput()).toEqual({ organization: org, outcome: 'created' });
  });

  it('rejects the removed --team-id selector', async () => {
    client.config.currentTeam = 'team_other';
    const fetch = vi.spyOn(client, 'fetch');
    expect(
      await run('create', '--slug', org.slug, '--team-id', 'team_root')
    ).toBe(2);
    expect(client.stderr.getFullOutput()).toContain('unknown or unexpected');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks for a root team when no team is selected', async () => {
    client.config.currentTeam = undefined;
    expect(
      await runExpectingAgentExit(
        'create',
        '--slug',
        org.slug,
        '--non-interactive'
      )
    ).toMatchObject({
      status: 'action_required',
      reason: 'missing_scope',
      message:
        "Can't create an organization without a team. Select the root team with --scope.",
    });
  });

  // An agent run without --scope has no team yet. It gets the team the way
  // every other team-scoped command does, and never sends an empty teamId.
  it('uses VERCEL_ORG_ID as the root team for an agent run', async () => {
    client.ignoresSavedTeam = true;
    client.config.currentTeam = TEAM_NOT_CHOSEN;
    vi.stubEnv('VERCEL_ORG_ID', 'team_root');
    client.scenario.post('/v1/organizations', (req, res) => {
      expect(req.query).toEqual({ teamId: 'team_root' });
      res.json(org);
    });
    expect(await run('create', '--slug', org.slug, '--json')).toBe(0);
    expect(jsonOutput()).toEqual({ organization: org, outcome: 'created' });
  });

  it('asks for a root team when an agent run has several to choose from', async () => {
    client.ignoresSavedTeam = true;
    client.config.currentTeam = TEAM_NOT_CHOSEN;
    vi.stubEnv('VERCEL_ORG_ID', '');
    useUser();
    useTeams('team_other');
    const post = vi.fn();
    client.scenario.post('/v1/organizations', post);
    expect(
      await runExpectingAgentExit(
        'create',
        '--slug',
        org.slug,
        '--non-interactive'
      )
    ).toMatchObject({ status: 'action_required', reason: 'missing_scope' });
    expect(post).not.toHaveBeenCalled();
  });
});
