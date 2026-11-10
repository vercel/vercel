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
import { encodeListCursor } from '../../../../../src/util/organizations/pagination';

setupOrganizationsTest();

const listTeam = {
  ...team,
  slug: 'acme-web',
  name: 'Acme Web',
  avatar: null,
};

describe('organizations teams list', () => {
  it('rejects an explicitly empty cursor instead of fetching the first page', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(
      await runExpectingAgentExit(
        'teams',
        'list',
        org.organizationId,
        '--next',
        '',
        '--non-interactive'
      )
    ).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('identifies a malformed team field without including its value', async () => {
    client.scenario.get(
      `/v1/organizations/${org.organizationId}/teams`,
      (_req, res) =>
        res.json({
          teams: [{ ...listTeam, slug: { private: 'do-not-print' } }],
        })
    );
    expect(
      await runExpectingAgentExit(
        'teams',
        'list',
        org.organizationId,
        '--non-interactive'
      )
    ).toMatchObject({
      status: 'error',
      reason: 'api_error',
      message: expect.stringContaining(
        'The Organizations API returned an invalid response at teams.0.slug.'
      ),
    });
    expect(client.getFullOutput()).not.toContain('do-not-print');
  });

  // The CLI ships on npm and cannot update with the API, so a new SSO mode or
  // billing plan must print rather than fail every team command.
  it('renders SSO modes and billing plans it does not know', async () => {
    const future = {
      ...listTeam,
      ssoMode: 'directory',
      billingPlan: 'reseller',
    };
    client.scenario.get(
      `/v1/organizations/${org.organizationId}/teams`,
      (_req, res) => res.json({ teams: [future] })
    );
    expect(
      await run('teams', 'list', org.organizationId, '--format', 'json')
    ).toBe(0);
    expect(jsonOutput()).toEqual({
      teams: [future],
      pagination: { next: null },
    });
  });

  it('passes the API cursor from --next without inheriting the active team', async () => {
    client.config.currentTeam = 'team_unrelated';
    const apiCursor = 'a+/=&?teamId=wrong';
    client.scenario.get(
      `/v1/organizations/${org.organizationId}/teams`,
      (req, res) => {
        if (req.query.cursor === apiCursor) {
          expect(req.query).toEqual({ cursor: apiCursor });
          res.json({ teams: [listTeam], cursor: 'page-3' });
          return;
        }
        expect(req.query).toEqual({ cursor: 'page-3' });
        res.json({ teams: [] });
      }
    );
    expect(
      await run(
        'teams',
        'ls',
        org.organizationId,
        '--next',
        encodeListCursor({ cursor: apiCursor, offset: 0 }),
        '--format',
        'json'
      )
    ).toBe(0);
    expect(jsonOutput()).toEqual({
      teams: [listTeam],
      pagination: { next: null },
    });
  });

  // The API can return an empty page that still has a cursor.
  it('reads past empty API pages to fill the page', async () => {
    client.scenario.get(
      `/v1/organizations/${org.organizationId}/teams`,
      (req, res) => {
        if (req.query.cursor === 'page-2') {
          res.json({ teams: [listTeam] });
          return;
        }
        res.json({ teams: [], cursor: 'page-2' });
      }
    );
    expect(
      await run('teams', 'list', org.organizationId, '--format', 'json')
    ).toBe(0);
    expect(jsonOutput()).toEqual({
      teams: [listTeam],
      pagination: { next: null },
    });
  });

  it('stops at --limit inside an API page and resumes with --next', async () => {
    const teams = ['a', 'b', 'c'].map(slug => ({
      ...listTeam,
      teamId: `team_${slug}`,
      slug,
    }));
    let requests = 0;
    client.scenario.get(
      `/v1/organizations/${org.organizationId}/teams`,
      (_req, res) => {
        requests++;
        res.json({ teams });
      }
    );

    expect(
      await run(
        'teams',
        'list',
        org.organizationId,
        '--limit',
        '2',
        '--format',
        'json'
      )
    ).toBe(0);
    const first = jsonOutput();
    expect(first.teams.map((t: { slug: string }) => t.slug)).toEqual([
      'a',
      'b',
    ]);
    expect(first.pagination.next).toEqual(expect.any(String));

    const firstLength = client.stdout.getFullOutput().length;
    expect(
      await run(
        'teams',
        'list',
        org.organizationId,
        '--limit',
        '2',
        '--next',
        first.pagination.next,
        '--format',
        'json'
      )
    ).toBe(0);
    expect(
      JSON.parse(client.stdout.getFullOutput().slice(firstLength))
    ).toEqual({
      teams: [teams[2]],
      pagination: { next: null },
    });
    expect(requests).toBe(2);
  });

  it('prints the next-page command with the caller flags', async () => {
    client.scenario.get(
      `/v1/organizations/${org.organizationId}/teams`,
      (_req, res) => res.json({ teams: [listTeam, listTeam] })
    );
    expect(await run('teams', 'list', org.organizationId, '--limit', '1')).toBe(
      0
    );
    expect(client.stderr.getFullOutput()).toContain(
      `vercel organizations teams list ${org.organizationId} --limit 1 --next=`
    );
  });

  it('rejects a --limit above the cap before requests', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    expect(
      await runExpectingAgentExit(
        'teams',
        'list',
        org.organizationId,
        '--limit',
        '101',
        '--non-interactive'
      )
    ).toMatchObject({ status: 'error', reason: 'invalid_arguments' });
    expect(fetch).not.toHaveBeenCalled();
  });

  // The table is the result, so it pipes. Status stays on stderr.
  it('prints the human table on stdout', async () => {
    client.scenario.get(
      `/v1/organizations/${org.organizationId}/teams`,
      (_req, res) => res.json({ teams: [listTeam] })
    );
    expect(await run('teams', 'list', org.organizationId, '--no-color')).toBe(
      0
    );
    const stdout = client.stdout.getFullOutput();
    expect(stdout).toContain(listTeam.teamId);
    expect(stdout).toContain(listTeam.slug);
    expect(stdout).not.toContain('\u001b');
    expect(client.stderr.getFullOutput()).not.toContain(listTeam.teamId);
  });
});
