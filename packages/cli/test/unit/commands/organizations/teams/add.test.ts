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

describe('organizations teams add', () => {
  it('reports a missing selector as action required', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    const prompt = vi.spyOn(client.input, 'text');
    expect(
      await runExpectingAgentExit(
        'teams',
        'add',
        org.organizationId,
        '--non-interactive'
      )
    ).toMatchObject({
      status: 'action_required',
      action: 'missing_arguments',
      reason: 'missing_arguments',
      message: 'Provide --child-team with the existing team ID or slug.',
    });
    const payload = client.stdout.getFullOutput();
    // The caller can add the flag, and `list` doesn't find a team.
    expect(payload).not.toContain('userActionRequired');
    expect(payload).not.toContain('vercel organizations list');
    expect(fetch).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it.each([
    { flags: ['--child-team', ''] },
    { flags: ['--child-team', 'Not A Slug'] },
    { flags: ['--child-team', 'team_'] },
  ])('rejects an unusable --child-team in $flags before requests', async ({
    flags,
  }) => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(
      await runExpectingAgentExit(
        'teams',
        'add',
        org.organizationId,
        ...flags,
        '--non-interactive'
      )
    ).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: expect.stringContaining(
        'Provide --child-team with the existing team ID or slug.'
      ),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an unknown billing plan before requests', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(
      await runExpectingAgentExit(
        'teams',
        'add',
        org.organizationId,
        '--child-team',
        team.teamId,
        '--billing-plan',
        '',
        '--non-interactive'
      )
    ).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: 'Use --billing-plan platform or --billing-plan enterprise.',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  // The CLI resolves the team before consent, so the request always carries
  // the team ID, whichever form the person typed.
  it.each([
    team.teamId,
    'acme-web',
  ])('adds an existing team selected by %s without defaulting the billing plan', async value => {
    useChildTeam(value);
    client.scenario.post(
      `/v1/organizations/${org.organizationId}/teams`,
      (req, res) => {
        expect(req.body).toEqual({ mode: 'link', teamId: team.teamId });
        res.status(202).json(team);
      }
    );
    expect(
      await run(
        'teams',
        'add',
        org.organizationId,
        '--child-team',
        value,
        '--format',
        'json',
        '--yes'
      )
    ).toBe(0);
    expect(jsonOutput()).toEqual({ team, outcome: 'added' });
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:teams', value: 'teams' },
      { key: 'subcommand:teams:add', value: 'add' },
      { key: 'argument:organization', value: '[REDACTED]' },
      { key: 'option:format', value: 'json' },
      { key: 'option:child-team', value: '[REDACTED]' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });

  it('reports an unknown team as a missing team, not a missing organization', async () => {
    const post = vi.fn();
    client.scenario.get('/teams/acme-wbe', (_req, res) =>
      res
        .status(404)
        .json({ error: { code: 'not_found', message: 'Team not found' } })
    );
    client.scenario.post(`/v1/organizations/${org.organizationId}/teams`, post);
    expect(
      await runExpectingAgentExit(
        'teams',
        'add',
        org.organizationId,
        '--child-team',
        'acme-wbe',
        '--yes',
        '--non-interactive'
      )
    ).toMatchObject({
      status: 'error',
      reason: 'not_found',
      message: "Couldn't find team acme-wbe.",
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('reports a team in another organization as a conflict', async () => {
    useChildTeam(team.teamId);
    client.scenario.post(
      `/v1/organizations/${org.organizationId}/teams`,
      (_req, res) =>
        res.status(409).json({
          error: {
            code: 'team_already_in_organization',
            message: 'Team already belongs to another organization',
          },
        })
    );
    expect(
      await runExpectingAgentExit(
        'teams',
        'add',
        org.organizationId,
        '--child-team',
        team.teamId,
        '--yes',
        '--non-interactive'
      )
    ).toMatchObject({
      status: 'error',
      reason: 'conflict',
      message: `Can't add team acme-web to organization ${org.organizationId}. The team already belongs to an organization.`,
      data: { remoteMessage: 'Team already belongs to another organization' },
    });
  });

  it('rejects `link`, which is not a command alias', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(
      await run(
        'teams',
        'link',
        org.organizationId,
        '--child-team',
        team.teamId
      )
    ).toBe(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Unknown command link for vercel organizations teams.'
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects the removed --team-id and --slug selectors', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    for (const flag of ['--team-id', '--slug']) {
      client.reset();
      expect(
        await run('teams', 'add', org.organizationId, flag, team.teamId)
      ).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(`unknown or unexpected`);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('previews the billing change and adds the team after consent', async () => {
    useChildTeam(team.teamId);
    const confirm = vi.spyOn(client.input, 'confirm').mockResolvedValue(true);
    client.scenario.post(
      `/v1/organizations/${org.organizationId}/teams`,
      (_req, res) => res.status(202).json(team)
    );
    expect(
      await run('teams', 'add', org.organizationId, '--child-team', team.teamId)
    ).toBe(0);
    expect(confirm).toHaveBeenCalledWith(
      `Add team acme-web to organization ${org.organizationId} and move its billing?`,
      false
    );
    const stderr = client.stderr.getFullOutput();
    expect(stderr).toContain(
      "Moves billing for team acme-web to the organization's root team."
    );
    expect(stderr).toContain('✓ Added');
    expect(stderr).toContain(
      'Projects in team acme-web move to the organization in the background.'
    );
    // An interactive terminal shows the slug in the receipt only.
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('changes nothing when the person declines', async () => {
    useChildTeam(team.teamId);
    vi.spyOn(client.input, 'confirm').mockResolvedValue(false);
    const post = vi.fn();
    client.scenario.post(`/v1/organizations/${org.organizationId}/teams`, post);
    expect(
      await run('teams', 'add', org.organizationId, '--child-team', team.teamId)
    ).toBe(130);
    expect(client.stderr.getFullOutput()).toContain(
      'Canceled.\n  Nothing was changed.'
    );
    expect(client.stderr.getFullOutput()).not.toContain('✓ Added');
    expect(post).not.toHaveBeenCalled();
  });

  it('requires --yes when it cannot prompt', async () => {
    useChildTeam(team.teamId);
    const confirm = vi.spyOn(client.input, 'confirm');
    const post = vi.fn();
    client.scenario.post(`/v1/organizations/${org.organizationId}/teams`, post);
    expect(
      await runExpectingAgentExit(
        'teams',
        'add',
        org.organizationId,
        '--child-team',
        team.teamId,
        '--non-interactive'
      )
    ).toMatchObject({
      status: 'action_required',
      reason: 'confirmation_required',
      action: 'confirmation_required',
      userActionRequired: true,
      message: "Can't add team acme-web without --yes in non-interactive mode.",
      data: {
        organizationId: org.organizationId,
        team: 'acme-web',
        effects: [
          "Moves billing for team acme-web to the organization's root team.",
        ],
      },
      next: [
        {
          command: expect.stringContaining('--yes'),
          when: expect.stringMatching(/^Only after a human approves: /),
        },
      ],
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('requires --yes in CI, even on a terminal', async () => {
    vi.stubEnv('CI', 'true');
    useChildTeam(team.teamId);
    const confirm = vi.spyOn(client.input, 'confirm');
    const post = vi.fn();
    client.scenario.post(`/v1/organizations/${org.organizationId}/teams`, post);
    expect(
      await run('teams', 'add', org.organizationId, '--child-team', team.teamId)
    ).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      "Can't add team acme-web without --yes in non-interactive mode."
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('adds the team with --yes and prints its slug for scripts', async () => {
    useChildTeam(team.teamId);
    const confirm = vi.spyOn(client.input, 'confirm');
    client.scenario.post(
      `/v1/organizations/${org.organizationId}/teams`,
      (_req, res) => res.status(202).json(team)
    );
    expect(
      await run(
        'teams',
        'add',
        org.organizationId,
        '--child-team',
        team.teamId,
        '--yes',
        '--non-interactive'
      )
    ).toBe(0);
    expect(confirm).not.toHaveBeenCalled();
    expect(client.stderr.getFullOutput()).toContain('✓ Added');
    expect(client.stdout.getFullOutput()).toBe('acme-web\n');
  });
});

/** Registers `GET /teams/:ref` for the team that `--child-team` selects. */
function useChildTeam(ref: string) {
  client.scenario.get(`/teams/${ref}`, (_req, res) =>
    res.json({ id: team.teamId, slug: 'acme-web', name: 'Acme Web' })
  );
}
