/**
 * Portable `vc whoami` scenarios. Every expected outcome, stdout, operation
 * log, and world patch below is written by hand; helpers only compose worlds.
 * Run `pnpm scenarios:generate` in packages/cli after editing.
 */
import type { AuthoredScenario } from '../model/schemas';
import {
  globalTeam,
  localTeam,
  northstarDefaultTeam,
  northstarUser,
  northstarUsernameTeam,
  scenarioApp,
  scenarioAppId,
  scenarioToken,
  scenarioUser,
  virtualTeam,
} from '../authoring/fixtures';
import {
  baseAppWorld,
  baseUserWorld,
  member,
  op,
  ops,
  teamSummary,
  unchanged,
  withLocal,
  withStoredCredentials,
  withTeam,
} from '../authoring/helpers';

const personal = {
  username: scenarioUser.username,
  email: scenarioUser.email,
  name: scenarioUser.name,
};

const userWorld = baseUserWorld(scenarioUser, scenarioToken);
const userWorldWithGlobal = withTeam(
  userWorld,
  globalTeam,
  member(scenarioUser)
);
const userWorldWithGlobalAndLocal = withTeam(
  userWorldWithGlobal,
  localTeam,
  member(scenarioUser)
);
const appWorld = baseAppWorld(
  scenarioAppId,
  scenarioApp,
  globalTeam,
  scenarioToken
);
const appRequires = ['app-principal', 'oauth-test-issuer'];
const localProjectLink = { orgId: localTeam.id, projectId: 'prj_local' };

export const whoamiScenarios: AuthoredScenario[] = [
  {
    id: 'whoami/logged-out',
    summary:
      'Reports logged out without a token or login prompt. The TS CLI still makes a best-effort, unauthenticated bootstrap user lookup; the Go audit expects zero requests here (known cross-implementation difference).',
    world: userWorld,
    invoke: { argv: ['whoami'], token: null },
    expect: {
      outcome: { kind: 'error', error: 'logged_out' },
      stdout: { kind: 'empty' },
      operations: ops.exact(op.userGet()),
      worldAfter: unchanged(),
    },
  },
  {
    id: 'whoami/personal-plain',
    summary: 'Non-TTY output prints only the personal username.',
    world: userWorld,
    invoke: { argv: ['whoami'], token: scenarioToken },
    expect: {
      outcome: { kind: 'success' },
      stdout: { kind: 'exact', value: 'scenario-user\n' },
      operations: ops.exact(op.userGet()),
      worldAfter: unchanged(),
    },
  },
  {
    id: 'whoami/personal-json',
    summary: 'Prints personal identity as JSON.',
    world: userWorld,
    invoke: { argv: ['whoami', '--format', 'json'], token: scenarioToken },
    expect: {
      outcome: { kind: 'success' },
      stdout: { kind: 'json', value: { team: null, ...personal } },
      operations: ops.exact(op.userGet()),
      worldAfter: unchanged(),
    },
  },
  {
    id: 'whoami/scope-team-json',
    summary: '--scope resolves a direct team during bootstrap.',
    world: userWorldWithGlobal,
    invoke: {
      argv: ['whoami', '--format', 'json', '--scope', 'global-team'],
      token: scenarioToken,
    },
    expect: {
      outcome: { kind: 'success' },
      stdout: {
        kind: 'json',
        value: { team: teamSummary(globalTeam), ...personal },
      },
      operations: ops.exact(op.userGet(), op.teamsList()),
      worldAfter: unchanged(),
    },
  },
  {
    id: 'whoami/linked-project-local-override',
    summary:
      'Stored credentials plus a linked project report a local override; the CLI persists the userId into auth.json.',
    world: withLocal(
      withStoredCredentials(userWorldWithGlobalAndLocal, scenarioToken),
      {
        settings: { credStorage: 'file', currentTeam: 'team_global' },
        projectLink: localProjectLink,
      }
    ),
    invoke: { argv: ['whoami', '--format', 'json'], token: null },
    expect: {
      outcome: { kind: 'success' },
      stdout: {
        kind: 'json',
        value: {
          team: teamSummary(localTeam),
          ...personal,
          localOverride: true,
          globalTeam: teamSummary(globalTeam),
        },
      },
      operations: ops.exact(
        op.userGet(),
        op.teamGet('team_global', 'team_global'),
        op.teamGet('team_local', 'team_local')
      ),
      worldAfter: { local: { credentials: { userId: 'user_scenario' } } },
    },
  },
  {
    id: 'whoami/explicit-scope-over-link',
    summary: 'An explicit --scope wins over a linked project; no override.',
    world: withLocal(userWorldWithGlobalAndLocal, {
      projectLink: localProjectLink,
    }),
    invoke: {
      argv: ['whoami', '--format', 'json', '--scope', 'global-team'],
      token: scenarioToken,
    },
    expect: {
      outcome: { kind: 'success' },
      stdout: {
        kind: 'json',
        value: { team: teamSummary(globalTeam), ...personal },
      },
      operations: ops.exact(op.userGet(), op.teamsList()),
      worldAfter: unchanged(),
    },
  },
  {
    id: 'whoami/app-json',
    summary:
      'An app token prints the app principal and its bound team as JSON via OAuth introspection.',
    requires: appRequires,
    world: appWorld,
    invoke: { argv: ['whoami', '--format', 'json'], token: scenarioToken },
    expect: {
      outcome: { kind: 'success' },
      stdout: {
        kind: 'json',
        value: {
          team: teamSummary(globalTeam),
          app: { id: 'app_scenario', name: 'Scenario App' },
        },
      },
      operations: ops.unordered(
        op.oauthDiscovery(),
        op.userGet(),
        op.oauthIntrospect(),
        op.teamGet('team_global', 'team_global')
      ),
      worldAfter: unchanged(),
    },
  },
  {
    id: 'whoami/app-plain',
    summary: 'Non-TTY output for an app token prints only the app id.',
    requires: appRequires,
    world: appWorld,
    invoke: { argv: ['whoami'], token: scenarioToken },
    expect: {
      outcome: { kind: 'success' },
      stdout: { kind: 'exact', value: 'app_scenario\n' },
      operations: ops.unordered(
        op.oauthDiscovery(),
        op.userGet(),
        op.oauthIntrospect(),
        op.teamGet('team_global', 'team_global')
      ),
      worldAfter: unchanged(),
    },
  },
  {
    id: 'whoami/app-scope',
    summary: '--scope resolves against the app token team.',
    requires: appRequires,
    world: appWorld,
    invoke: {
      argv: ['whoami', '--format', 'json', '--scope', 'global-team'],
      token: scenarioToken,
    },
    expect: {
      outcome: { kind: 'success' },
      stdout: {
        kind: 'json',
        value: {
          team: teamSummary(globalTeam),
          app: { id: 'app_scenario', name: 'Scenario App' },
        },
      },
      operations: ops.unordered(
        op.oauthDiscovery(),
        op.userGet(),
        op.userGet(),
        op.oauthIntrospect(),
        op.oauthIntrospect(),
        op.teamGet('team_global', 'team_global')
      ),
      worldAfter: unchanged(),
    },
  },
  {
    id: 'whoami/scope-virtual-team',
    summary:
      '--scope resolves a virtual team membership through a direct lookup without teamId.',
    world: withTeam(
      userWorldWithGlobal,
      virtualTeam,
      member(scenarioUser, 'virtual')
    ),
    invoke: {
      argv: ['whoami', '--format', 'json', '--scope', 'virtual-team'],
      token: scenarioToken,
    },
    expect: {
      outcome: { kind: 'success' },
      stdout: {
        kind: 'json',
        value: { team: teamSummary(virtualTeam), ...personal },
      },
      operations: ops.exact(
        op.userGet(),
        op.teamsList(),
        op.teamGet('virtual-team', null)
      ),
      worldAfter: unchanged(),
    },
  },
  {
    id: 'whoami/northstar-username-team-wins',
    summary:
      'A team whose slug equals a Northstar username wins over the personal account.',
    world: withTeam(
      withTeam(
        baseUserWorld(northstarUser, scenarioToken),
        northstarDefaultTeam,
        member(northstarUser)
      ),
      northstarUsernameTeam,
      member(northstarUser)
    ),
    invoke: {
      argv: ['whoami', '--format', 'json', '--scope', 'northstar-user'],
      token: scenarioToken,
    },
    expect: {
      outcome: { kind: 'success' },
      stdout: {
        kind: 'json',
        value: {
          team: teamSummary(northstarUsernameTeam),
          username: 'northstar-user',
          email: 'northstar@example.test',
          name: 'Northstar User',
        },
      },
      operations: ops.exact(op.userGet(), op.teamsList()),
      worldAfter: unchanged(),
    },
  },
  {
    id: 'whoami/northstar-personal-scope-rejected',
    summary:
      'A Northstar personal account is rejected as --scope; the identity match skips the direct team lookup.',
    world: withTeam(
      baseUserWorld(northstarUser, scenarioToken),
      northstarDefaultTeam,
      member(northstarUser)
    ),
    invoke: {
      argv: ['whoami', '--format', 'json', '--scope', 'northstar-user'],
      token: scenarioToken,
    },
    expect: {
      outcome: { kind: 'error', error: 'personal_scope_not_allowed' },
      stdout: { kind: 'empty' },
      operations: ops.exact(op.userGet(), op.teamsList()),
      worldAfter: unchanged(),
    },
  },
  {
    id: 'whoami/scope-teams-failure-ignored-for-identity',
    summary:
      'A teams-list failure is ignored when --scope matches the user identity.',
    world: userWorld,
    conditions: { faults: { 'teams.list': 'client_error' } },
    invoke: {
      argv: ['whoami', '--format', 'json', '--scope', 'scenario-user'],
      token: scenarioToken,
    },
    expect: {
      outcome: { kind: 'success' },
      stdout: { kind: 'json', value: { team: null, ...personal } },
      operations: ops.exact(op.userGet(), op.teamsList()),
      worldAfter: unchanged(),
    },
  },
  {
    id: 'whoami/scope-teams-rate-limited',
    summary: 'A rate-limited teams list fails a team --scope.',
    world: userWorldWithGlobal,
    conditions: { faults: { 'teams.list': 'rate_limited' } },
    invoke: {
      argv: ['whoami', '--format', 'json', '--scope', 'global-team'],
      token: scenarioToken,
    },
    expect: {
      outcome: { kind: 'error', error: 'scope_teams_rate_limited' },
      stdout: { kind: 'empty' },
      operations: ops.exact(op.userGet(), op.teamsList()),
      worldAfter: unchanged(),
    },
  },
];
