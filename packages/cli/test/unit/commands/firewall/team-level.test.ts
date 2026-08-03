import { describe, expect, it, beforeEach } from 'vitest';
import { client } from '../../../mocks/client';
import firewall from '../../../../src/commands/firewall';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import {
  useListTeamFirewallConfigs,
  usePatchTeamDraft,
  useActivateTeamConfig,
  useDeleteTeamDraft,
  useTeamConfigError,
  capturedRequests,
  createConfig,
  createChange,
  createRule,
  createIpRule,
} from '../../../mocks/firewall';
import { setupTmpDir } from '../../../helpers/setup-unit-fixture';

function teamConfig(overrides = {}) {
  return createConfig({ projectKey: 'v1_sc#active', ...overrides });
}

function teamDraft(overrides = {}) {
  return createConfig({
    projectKey: 'v1_sc#draft',
    id: 'team_config_draft',
    version: 2,
    changes: [createChange('rules.insert', { id: 'rule_001' })],
    ...overrides,
  });
}

describe('firewall --team-level', () => {
  beforeEach(() => {
    useUser();
    useTeams('team_dummy');
    client.config.currentTeam = 'team_dummy';
    // Unlinked directory — team-level commands must not require `vercel link`
    client.cwd = setupTmpDir();
    for (const key of Object.keys(capturedRequests)) {
      delete (capturedRequests as Record<string, unknown>)[key];
    }
  });

  it('rejects --team-level combined with --project', async () => {
    client.setArgv('firewall', 'diff', '--team-level', '--project', 'foo');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Cannot specify both --team-level and --project'
    );
  });

  it('diff works from an unlinked directory and targets the team config', async () => {
    useListTeamFirewallConfigs(teamConfig(), null);

    client.setArgv('firewall', 'diff', '--team-level');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('No pending changes.');
    expect(capturedRequests.teamConfigQuery?.teamId).toBe('team_dummy');
    expect(capturedRequests.teamConfigQuery?.projectId).toBeUndefined();
  });

  it('diff suggests publish/discard commands with --team-level', async () => {
    useListTeamFirewallConfigs(teamConfig(), teamDraft());

    client.setArgv('firewall', 'diff', '--team-level');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('firewall publish --team-level');
  });

  it('publish activates the team draft', async () => {
    useListTeamFirewallConfigs(teamConfig(), teamDraft());
    useActivateTeamConfig();

    client.setArgv('firewall', 'publish', '--team-level', '--yes');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    expect(capturedRequests.teamActivate?.version).toBe('draft');
    expect(capturedRequests.teamActivate?.query.teamId).toBe('team_dummy');
  });

  it('discard deletes the team draft (204 response)', async () => {
    useListTeamFirewallConfigs(teamConfig(), teamDraft());
    useDeleteTeamDraft();

    client.setArgv('firewall', 'discard', '--team-level', '--yes');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    expect(capturedRequests.teamDeleteDraft?.query.teamId).toBe('team_dummy');
  });

  it('rules list reads the team config', async () => {
    useListTeamFirewallConfigs(teamConfig({ rules: [createRule(1)] }), null);

    client.setArgv('firewall', 'rules', 'list', '--team-level');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput('Test Rule 1');
    expect(capturedRequests.teamConfigQuery?.teamId).toBe('team_dummy');
  });

  it('rules add stages a rules.insert patch on the team draft', async () => {
    useListTeamFirewallConfigs(teamConfig(), null);
    usePatchTeamDraft();
    useActivateTeamConfig();

    client.setArgv(
      'firewall',
      'rules',
      'add',
      'Block bad IP',
      '--condition',
      '{"type":"ip_address","op":"eq","value":"1.1.1.1"}',
      '--action',
      'deny',
      '--team-level',
      '--yes'
    );
    const exitCode = await firewall(client);
    await expect(client.stderr).toOutput('Rule "Block bad IP" staged');
    expect(exitCode).toEqual(0);
    expect(capturedRequests.teamPatchDraft?.action).toBe('rules.insert');
    expect(capturedRequests.teamPatchDraft?.query.teamId).toBe('team_dummy');
    expect(capturedRequests.teamPatchDraft?.query.projectId).toBeUndefined();
  });

  it('rules remove stages a rules.remove patch on the team draft', async () => {
    useListTeamFirewallConfigs(teamConfig({ rules: [createRule(1)] }), null);
    usePatchTeamDraft();
    useActivateTeamConfig();

    client.setArgv(
      'firewall',
      'rules',
      'remove',
      'rule_001',
      '--team-level',
      '--yes'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    expect(capturedRequests.teamPatchDraft?.action).toBe('rules.remove');
    expect(capturedRequests.teamPatchDraft?.id).toBe('rule_001');
  });

  it('rules disable stages a rules.update patch on the team draft', async () => {
    // createRule(1) is active (index % 3 !== 0)
    useListTeamFirewallConfigs(teamConfig({ rules: [createRule(1)] }), null);
    usePatchTeamDraft();
    useActivateTeamConfig();

    client.setArgv(
      'firewall',
      'rules',
      'disable',
      'rule_001',
      '--team-level',
      '--yes'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    expect(capturedRequests.teamPatchDraft?.action).toBe('rules.update');
    expect((capturedRequests.teamPatchDraft?.value as any)?.active).toBe(false);
  });

  it('rules add rejects --ai with --team-level', async () => {
    client.setArgv(
      'firewall',
      'rules',
      'add',
      '--ai',
      'block everything',
      '--team-level'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'AI mode is not available with --team-level'
    );
  });

  it('ip-blocks block stages an ip.insert patch on the team draft', async () => {
    useListTeamFirewallConfigs(teamConfig(), null);
    usePatchTeamDraft();
    useActivateTeamConfig();

    client.setArgv(
      'firewall',
      'ip-blocks',
      'block',
      '1.1.1.1',
      '--team-level',
      '--yes'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    expect(capturedRequests.teamPatchDraft?.action).toBe('ip.insert');
    expect((capturedRequests.teamPatchDraft?.value as any)?.ip).toBe('1.1.1.1');
    expect(capturedRequests.teamPatchDraft?.query.teamId).toBe('team_dummy');
  });

  it('ip-blocks unblock stages an ip.remove patch on the team draft', async () => {
    useListTeamFirewallConfigs(teamConfig({ ips: [createIpRule(1)] }), null);
    usePatchTeamDraft();
    useActivateTeamConfig();

    client.setArgv(
      'firewall',
      'ip-blocks',
      'unblock',
      '10.0.0.1',
      '--team-level',
      '--yes'
    );
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    expect(capturedRequests.teamPatchDraft?.action).toBe('ip.remove');
    expect(capturedRequests.teamPatchDraft?.id).toBe('ip_001');
  });

  it('maps 403 plan_not_supported to an Enterprise plan message', async () => {
    useTeamConfigError(
      403,
      'plan_not_supported',
      'Team plan does not support this feature'
    );

    client.setArgv('firewall', 'rules', 'list', '--team-level');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'Team-level firewall requires an Enterprise plan.'
    );
  });

  it('maps plain 403 to a team owner message', async () => {
    useTeamConfigError(403, 'forbidden', 'Not authorized');

    client.setArgv('firewall', 'rules', 'list', '--team-level');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'You need to be a team owner to manage the team-level firewall.'
    );
  });

  it('surfaces gated-feature errors verbatim (401 Security Plus)', async () => {
    useTeamConfigError(
      401,
      'unauthorized',
      'This feature requires Security Plus to be enabled'
    );

    client.setArgv('firewall', 'rules', 'list', '--team-level');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      'This feature requires Security Plus to be enabled'
    );
  });

  it('tracks the team-level flag in telemetry', async () => {
    useListTeamFirewallConfigs(teamConfig(), null);

    client.setArgv('firewall', 'diff', '--team-level');
    const exitCode = await firewall(client);
    expect(exitCode).toEqual(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'flag:team-level',
        value: 'TRUE',
      },
      {
        key: 'subcommand:diff',
        value: 'diff',
      },
    ]);
  });
});
