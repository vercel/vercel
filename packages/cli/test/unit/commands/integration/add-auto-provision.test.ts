import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import open from 'open';
import integrationCommand from '../../../../src/commands/integration';
import pull from '../../../../src/commands/env/pull';
import { connectResourceToProject } from '../../../../src/util/integration-resource/connect-resource-to-project';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { useAutoProvision } from '../../../mocks/integration';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams, type Team } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

vi.mock('open', () => {
  return {
    default: vi.fn(),
  };
});

vi.mock('../../../../src/commands/env/pull', () => {
  return {
    default: vi.fn().mockResolvedValue(0),
  };
});

vi.mock(
  '../../../../src/util/integration-resource/connect-resource-to-project',
  () => {
    return {
      connectResourceToProject: vi.fn().mockResolvedValue({}),
    };
  }
);

const openMock = vi.mocked(open);
const pullMock = vi.mocked(pull);
const connectMock = vi.mocked(connectResourceToProject);

beforeEach(() => {
  openMock.mockClear();
  pullMock.mockClear();
  connectMock.mockClear();
  // Enable auto-provision feature flag
  process.env.FF_AUTO_PROVISION_INSTALL = '1';
  // Mock Math.random to get predictable resource names (gray-apple suffix)
  vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('integration add (auto-provision)', () => {
  let team: Team;

  beforeEach(() => {
    useUser();
    const teams = useTeams('team_dummy');
    team = Array.isArray(teams) ? teams[0] : teams.teams[0];
    client.config.currentTeam = team.id;
  });

  describe('successful provisioning', () => {
    beforeEach(() => {
      useAutoProvision({ responseKey: 'provisioned' });
    });

    it('should provision a resource without project context', async () => {
      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput(
        `Installing Acme Product by Acme Integration under ${team.slug}`
      );

      // Auto-generated name, server fills metadata defaults — no prompts
      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).not.toHaveBeenCalled();
      expect(pullMock).not.toHaveBeenCalled();
    });

    it('should provision and connect to project', async () => {
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;
      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput(
        `Installing Acme Product by Acme Integration under ${team.slug}`
      );

      // Auto-generated name, server fills metadata defaults — no prompts
      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
      );

      // After provisioning, auto-connect and env pull happen without prompts
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).not.toHaveBeenCalled();
      expect(pullMock).toHaveBeenCalledWith(
        client,
        ['--yes'],
        'vercel-cli:integration:add'
      );
    });

    it('should warn when env pull fails', async () => {
      pullMock.mockResolvedValueOnce(1);
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;
      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      // Auto-generated name, server fills metadata defaults — no prompts
      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
      );
      await expect(client.stderr).toOutput(
        'acme-gray-apple successfully connected to vercel-integration-add'
      );
      await expect(client.stderr).toOutput(
        'Failed to pull environment variables. You can run `vercel env pull` manually.'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(pullMock).toHaveBeenCalledWith(
        client,
        ['--yes'],
        'vercel-cli:integration:add'
      );
    });

    it('should not env pull when connect fails', async () => {
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;

      connectMock.mockRejectedValueOnce(new Error('Connection failed'));

      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      // Auto-generated name, server fills metadata defaults — no prompts
      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(1);
      expect(pullMock).not.toHaveBeenCalled();
    });

    it('should skip connecting with --no-connect flag', async () => {
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;
      client.setArgv('integration', 'add', 'acme', '--no-connect');
      const exitCodePromise = integrationCommand(client);

      // Auto-generated name, server fills metadata defaults — no prompts
      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(pullMock).not.toHaveBeenCalled();
    });

    it('should skip env pull with --no-env-pull flag', async () => {
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;
      client.setArgv('integration', 'add', 'acme', '--no-env-pull');
      const exitCodePromise = integrationCommand(client);

      // Auto-generated name, server fills metadata defaults — no prompts
      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
      );

      await expect(client.stderr).toOutput(
        'acme-gray-apple successfully connected to vercel-integration-add'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(pullMock).not.toHaveBeenCalled();
    });

    it('should track telemetry', async () => {
      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      // Auto-generated name, server fills metadata defaults — no prompts
      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
      );

      await exitCodePromise;

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:add',
          value: 'add',
        },
        {
          key: 'argument:integration',
          value: 'acme',
        },
      ]);
    });

    it('should track metadata telemetry when --metadata is used', async () => {
      client.setArgv(
        'integration',
        'add',
        'acme',
        '--metadata',
        'region=us-east-1'
      );
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned'
      );

      await exitCodePromise;

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:add',
          value: 'add',
        },
        {
          key: 'option:metadata',
          value: '[REDACTED]',
        },
        {
          key: 'argument:integration',
          value: 'acme',
        },
      ]);
    });
  });

  describe('policy acceptance flow', () => {
    beforeEach(() => {
      // First call returns 'install' (policies required), second call returns 'provisioned'
      useAutoProvision({
        responseKey: 'install',
        secondResponseKey: 'provisioned',
      });
    });

    it('should prompt for policy acceptance and retry', async () => {
      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      // Auto-generated name, server fills metadata defaults — no prompts
      await expect(client.stderr).toOutput('Accept privacy policy?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Accept terms of service?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('should exit with code 1 when privacy policy declined', async () => {
      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      // Auto-generated name, server fills metadata defaults — no prompts
      await expect(client.stderr).toOutput('Accept privacy policy?');
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput(
        'Privacy policy must be accepted to continue.'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(1);
    });

    it('should exit with code 1 when terms of service declined', async () => {
      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      // Auto-generated name, server fills metadata defaults — no prompts
      await expect(client.stderr).toOutput('Accept privacy policy?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Accept terms of service?');
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput(
        'Terms of service must be accepted to continue.'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(1);
    });
  });

  describe('fallback to browser', () => {
    it('should open browser for metadata fallback with source and defaultResourceName', async () => {
      useAutoProvision({ responseKey: 'metadata' });

      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      // Auto-generated name, server fills metadata defaults — no prompts
      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://vercel.com/acme/~/integrations/checkout/acme'
        )
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/defaultResourceName=acme-gray-apple/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/source=cli/)
      );
      // No --metadata flags, so metadata should NOT be in the URL
      expect(openMock).toHaveBeenCalledWith(
        expect.not.stringMatching(/metadata=/)
      );
    });

    it('should forward --metadata to browser fallback URL', async () => {
      useAutoProvision({ responseKey: 'metadata' });

      client.setArgv(
        'integration',
        'add',
        'acme',
        '--metadata',
        'region=us-east-1'
      );
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      const calledUrl = openMock.mock.calls[0]?.[0] as string;
      const parsed = new URL(calledUrl);
      expect(parsed.searchParams.get('metadata')).toEqual(
        JSON.stringify({ region: 'us-east-1' })
      );
    });

    it('should forward --metadata to browser URL with slash syntax, --name, and --metadata together', async () => {
      useAutoProvision({ responseKey: 'metadata' });

      client.setArgv(
        'integration',
        'add',
        'acme-two-products/acme-a',
        '--name',
        'my-db',
        '--metadata',
        'version=5.4',
        '--metadata',
        'region=pdx1'
      );
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      const calledUrl = openMock.mock.calls[0]?.[0] as string;
      const parsed = new URL(calledUrl);
      expect(parsed.searchParams.get('defaultResourceName')).toEqual('my-db');
      expect(parsed.searchParams.get('metadata')).toEqual(
        JSON.stringify({ version: '5.4', region: 'pdx1' })
      );
      expect(parsed.searchParams.get('source')).toEqual('cli');
    });

    it('should open browser for unknown fallback without metadata in URL', async () => {
      useAutoProvision({ responseKey: 'unknown' });

      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      // Auto-generated name, server fills metadata defaults — no prompts
      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).toHaveBeenCalled();
      // No --metadata flags, so metadata should NOT be in the URL
      expect(openMock).toHaveBeenCalledWith(
        expect.not.stringMatching(/metadata=/)
      );
    });

    it('should forward --metadata to browser URL on unknown fallback', async () => {
      useAutoProvision({ responseKey: 'unknown' });

      client.setArgv(
        'integration',
        'add',
        'acme',
        '--metadata',
        'region=us-east-1'
      );
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      const calledUrl = openMock.mock.calls[0]?.[0] as string;
      const parsed = new URL(calledUrl);
      expect(parsed.searchParams.get('metadata')).toEqual(
        JSON.stringify({ region: 'us-east-1' })
      );
    });

    it('should forward --metadata to browser URL after policy retry falls back', async () => {
      // First call returns 'install' (policies required), second returns 'metadata' (still needs web)
      useAutoProvision({
        responseKey: 'install',
        secondResponseKey: 'metadata',
      });

      client.setArgv(
        'integration',
        'add',
        'acme',
        '--metadata',
        'region=us-east-1'
      );
      const exitCodePromise = integrationCommand(client);

      // Accept policies
      await expect(client.stderr).toOutput('Accept privacy policy?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Accept terms of service?');
      client.stdin.write('y\n');

      // After retry, still falls back to browser
      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      const calledUrl = openMock.mock.calls[0]?.[0] as string;
      const parsed = new URL(calledUrl);
      expect(parsed.searchParams.get('metadata')).toEqual(
        JSON.stringify({ region: 'us-east-1' })
      );
      expect(parsed.searchParams.get('source')).toEqual('cli');
    });

    it('should not include metadata in URL after policy retry falls back without --metadata', async () => {
      useAutoProvision({
        responseKey: 'install',
        secondResponseKey: 'metadata',
      });

      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput('Accept privacy policy?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Accept terms of service?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).toHaveBeenCalledWith(
        expect.not.stringMatching(/metadata=/)
      );
    });

    it('should include all three URL params (projectSlug, defaultResourceName, source) when project is linked', async () => {
      useAutoProvision({ responseKey: 'metadata' });
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;

      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      // Auto-generated name, server fills metadata defaults — no wizard prompts
      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      // Verify all three URL parameters are present
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/defaultResourceName=acme-gray-apple/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/projectSlug=vercel-integration-add/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/source=cli/)
      );
    });

    it('should not include projectSlug in URL with --no-connect', async () => {
      useAutoProvision({ responseKey: 'metadata' });
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;

      client.setArgv('integration', 'add', 'acme', '--no-connect');
      const exitCodePromise = integrationCommand(client);

      // Auto-generated name, server fills metadata defaults — no wizard prompts
      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      // Verify defaultResourceName and source are present, but not projectSlug
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/defaultResourceName=acme-gray-apple/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.not.stringMatching(/projectSlug=/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/source=cli/)
      );
    });

    it('should include custom --name in URL when fallback to browser without project', async () => {
      useAutoProvision({ responseKey: 'metadata' });

      client.setArgv('integration', 'add', 'acme', '--name', 'my-custom-db');
      const exitCodePromise = integrationCommand(client);

      // --name flag provides the name, server fills metadata defaults — no wizard prompts
      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/defaultResourceName=my-custom-db/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/source=cli/)
      );
    });

    it('should include custom --name and projectSlug in URL when project is linked', async () => {
      useAutoProvision({ responseKey: 'metadata' });
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;

      client.setArgv('integration', 'add', 'acme', '--name', 'my-proj-db');
      const exitCodePromise = integrationCommand(client);

      // Server fills defaults, no wizard prompt
      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/defaultResourceName=my-proj-db/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/projectSlug=vercel-integration-add/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/source=cli/)
      );
    });

    it('should not include projectSlug with --no-connect and custom --name', async () => {
      useAutoProvision({ responseKey: 'metadata' });
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;

      client.setArgv(
        'integration',
        'add',
        'acme',
        '--name',
        'my-nolink-db',
        '--no-connect'
      );
      const exitCodePromise = integrationCommand(client);

      // Auto-generated name, server fills metadata defaults — no prompts
      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/defaultResourceName=my-nolink-db/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.not.stringMatching(/projectSlug=/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/source=cli/)
      );
    });
  });

  describe('--name flag', () => {
    beforeEach(() => {
      useAutoProvision({ responseKey: 'provisioned' });
    });

    it('should use provided resource name from --name flag', async () => {
      client.setArgv('integration', 'add', 'acme', '--name', 'my-custom-name');
      const exitCodePromise = integrationCommand(client);

      // --name flag provides the name, server fills metadata defaults — no prompts
      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: my-custom-name'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('should reject invalid resource name from --name flag', async () => {
      client.setArgv(
        'integration',
        'add',
        'acme',
        '--name',
        'Invalid.Name@123'
      );
      const exitCode = await integrationCommand(client);

      await expect(client.stderr).toOutput(
        'Error: Resource name can only contain letters, numbers, underscores, and hyphens'
      );
      expect(exitCode).toEqual(1);
    });

    it('should reject empty resource name from --name flag', async () => {
      client.setArgv('integration', 'add', 'acme', '--name', '   ');
      const exitCode = await integrationCommand(client);

      await expect(client.stderr).toOutput(
        'Error: Resource name cannot be empty'
      );
      expect(exitCode).toEqual(1);
    });

    it('should reject resource name exceeding 128 characters', async () => {
      const longName = 'a'.repeat(129);
      client.setArgv('integration', 'add', 'acme', '--name', longName);
      const exitCode = await integrationCommand(client);

      await expect(client.stderr).toOutput(
        'Error: Resource name cannot exceed 128 characters'
      );
      expect(exitCode).toEqual(1);
    });

    it('should accept -n shorthand for --name flag', async () => {
      client.setArgv('integration', 'add', 'acme', '-n', 'shorthand-name');
      const exitCodePromise = integrationCommand(client);

      // --name flag provides the name, server fills metadata defaults — no wizard prompts
      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: shorthand-name'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('should accept exactly 128 character resource name', async () => {
      const maxName = 'a'.repeat(128);
      client.setArgv('integration', 'add', 'acme', '--name', maxName);
      const exitCodePromise = integrationCommand(client);

      // --name flag provides the name, server fills metadata defaults — no wizard prompts
      await expect(client.stderr).toOutput(
        `Acme Product successfully provisioned: ${maxName}`
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('should reject --name that violates aws-apg product-specific rules (must start with letter)', async () => {
      client.setArgv(
        'integration',
        'add',
        'aws-apg',
        '--name',
        '1starts-with-number'
      );
      const exitCode = await integrationCommand(client);

      await expect(client.stderr).toOutput(
        'Error: Resource name must start with a letter and can only contain letters, numbers, and hyphens'
      );
      expect(exitCode).toEqual(1);
    });

    it('should reject --name exceeding aws-apg 50-char limit', async () => {
      const longName = 'a'.repeat(51);
      client.setArgv('integration', 'add', 'aws-apg', '--name', longName);
      const exitCode = await integrationCommand(client);

      await expect(client.stderr).toOutput(
        'Error: Resource name cannot exceed 50 characters'
      );
      expect(exitCode).toEqual(1);
    });
  });

  describe('--plan flag', () => {
    it('should include billingPlanId in auto-provision request body', async () => {
      const { requestBodies } = useAutoProvision({
        responseKey: 'provisioned',
      });

      client.setArgv('integration', 'add', 'acme', '--plan', 'pro');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(requestBodies[0]).toMatchObject({
        billingPlanId: 'pro',
      });
    });

    it('should include planId in fallback URL when --plan is provided', async () => {
      useAutoProvision({ responseKey: 'metadata' });

      client.setArgv('integration', 'add', 'acme', '--plan', 'pro');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/planId=pro/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/source=cli/)
      );
    });

    it('should not include planId in fallback URL when --plan is not provided', async () => {
      useAutoProvision({ responseKey: 'metadata' });

      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).toHaveBeenCalledWith(
        expect.not.stringMatching(/planId=/)
      );
    });

    it('should provision successfully with --plan flag and -p shorthand', async () => {
      const { requestBodies } = useAutoProvision({
        responseKey: 'provisioned',
      });

      client.setArgv('integration', 'add', 'acme', '-p', 'team');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(requestBodies[0]).toMatchObject({
        billingPlanId: 'team',
      });
    });

    it('should include billingPlanId in retry request after policy acceptance', async () => {
      const { requestBodies } = useAutoProvision({
        responseKey: 'install',
        secondResponseKey: 'provisioned',
      });

      client.setArgv('integration', 'add', 'acme', '--plan', 'pro');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput('Accept privacy policy?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Accept terms of service?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      // Both initial and retry requests should include billingPlanId
      expect(requestBodies[0]).toMatchObject({ billingPlanId: 'pro' });
      expect(requestBodies[1]).toMatchObject({ billingPlanId: 'pro' });
    });
  });

  describe('errors', () => {
    beforeEach(() => {
      useAutoProvision({ responseKey: 'provisioned' });
    });

    it('should error when team not found', async () => {
      client.config.currentTeam = undefined;
      client.setArgv('integration', 'add', 'acme');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Error: Team not found');
    });

    it('should error when integration not found', async () => {
      client.setArgv('integration', 'add', 'does-not-exist');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Failed to get integration "does-not-exist"'
      );
    });

    it('should error when integration has no products', async () => {
      client.setArgv('integration', 'add', 'acme-no-products');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Integration "acme-no-products" is not a Marketplace integration'
      );
    });

    it('should error when integration is external', async () => {
      client.setArgv('integration', 'add', 'acme-external');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Integration "acme-external" is not a Marketplace integration'
      );
    });
  });

  describe('multiple products', () => {
    beforeEach(() => {
      useAutoProvision({ responseKey: 'provisioned' });
    });

    it('should error when multiple products and no slug specified in non-TTY', async () => {
      client.setArgv('integration', 'add', 'acme-two-products');
      (client.stdin as any).isTTY = false;
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('has multiple products');
      expect(stderr).toContain('acme-two-products/acme-a');
      expect(stderr).toContain('acme-two-products/acme-b');
    });

    it('should prompt for product selection when multiple products in TTY', async () => {
      client.setArgv('integration', 'add', 'acme-two-products');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput('Select a product');
      client.stdin.write('\n'); // Select first product

      // Auto-generated name, server fills metadata defaults — no prompts
      await expect(client.stderr).toOutput('successfully provisioned');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });
  });

  describe('--metadata flag', () => {
    beforeEach(() => {
      useAutoProvision({ responseKey: 'provisioned' });
    });

    it('should error on invalid metadata value before prompting for resource name', async () => {
      client.setArgv(
        'integration',
        'add',
        'acme',
        '--metadata',
        'region=invalid-region'
      );
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Metadata "region" must be one of: us-west-1, us-east-1'
      );
      // Should NOT prompt for resource name since validation fails first
      await expect(client.stderr).not.toOutput(
        'What is the name of the resource?'
      );
    });

    it('should error on unknown metadata key', async () => {
      client.setArgv(
        'integration',
        'add',
        'acme',
        '--metadata',
        'unknown=value'
      );
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Unknown metadata key: "unknown"'
      );
    });

    it('should error on invalid metadata format', async () => {
      client.setArgv(
        'integration',
        'add',
        'acme',
        '--metadata',
        'no-equals-sign'
      );
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Invalid metadata format: "no-equals-sign". Expected KEY=VALUE'
      );
    });

    it('should accept valid metadata and skip wizard prompts', async () => {
      client.setArgv(
        'integration',
        'add',
        'acme',
        '--metadata',
        'region=us-east-1'
      );
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput(
        `Installing Acme Product by Acme Integration under ${team.slug}`
      );

      // Auto-generated name, --metadata provides metadata — no prompts
      await expect(client.stderr).toOutput('successfully provisioned');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('should accept multiple metadata flags with slash syntax', async () => {
      client.setArgv(
        'integration',
        'add',
        'acme-two-products/acme-a',
        '--metadata',
        'version=5.4',
        '--metadata',
        'region=pdx1'
      );
      const exitCodePromise = integrationCommand(client);

      // Slash syntax selects product, --metadata provides metadata — no prompts
      await expect(client.stderr).toOutput('successfully provisioned');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('should coerce boolean metadata to true/false', async () => {
      client.setArgv(
        'integration',
        'add',
        'acme-full-schema',
        '--metadata',
        'region=iad1',
        '--metadata',
        'auth=true'
      );
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput('successfully provisioned');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('should reject invalid boolean metadata value', async () => {
      client.setArgv(
        'integration',
        'add',
        'acme-full-schema',
        '--metadata',
        'auth=yes'
      );
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Metadata "auth" must be "true" or "false", got: "yes"'
      );
    });

    it('should parse comma-separated array metadata', async () => {
      client.setArgv(
        'integration',
        'add',
        'acme-full-schema',
        '--metadata',
        'region=iad1',
        '--metadata',
        'readRegions=iad1,sfo1'
      );
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput('successfully provisioned');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('should error when required metadata is missing', async () => {
      // acme-full-schema has required: ['region'] and region has no default
      client.setArgv(
        'integration',
        'add',
        'acme-full-schema',
        '--metadata',
        'auth=true'
      );
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Required metadata missing: "region"'
      );
    });

    it('should reject invalid array item against ui:options', async () => {
      client.setArgv(
        'integration',
        'add',
        'acme-full-schema',
        '--metadata',
        'readRegions=iad1,invalid'
      );
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Metadata "readRegions" contains invalid value: "invalid". Must be one of: iad1, sfo1, fra1'
      );
    });
  });

  describe('product slash syntax', () => {
    beforeEach(() => {
      useAutoProvision({ responseKey: 'provisioned' });
    });

    it('should select product by slug and skip prompt', async () => {
      client.setArgv('integration', 'add', 'acme-two-products/acme-a');
      const exitCodePromise = integrationCommand(client);

      // Should NOT show "Select a product" prompt
      await expect(client.stderr).toOutput(
        `Installing Acme Product A by Acme Integration Two Products under ${team.slug}`
      );

      // Auto-generated name, server fills metadata defaults — no wizard prompts
      await expect(client.stderr).toOutput('successfully provisioned');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('should select second product by slug', async () => {
      client.setArgv('integration', 'add', 'acme-two-products/acme-b');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput(
        `Installing Acme Product B by Acme Integration Two Products under ${team.slug}`
      );

      await expect(client.stderr).toOutput('successfully provisioned');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('should use --name flag with slash syntax', async () => {
      client.setArgv(
        'integration',
        'add',
        'acme-two-products/acme-a',
        '--name',
        'my-custom-db'
      );
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput(
        `Installing Acme Product A by Acme Integration Two Products under ${team.slug}`
      );

      // --name flag provides the name, server fills metadata defaults — no wizard prompts
      await expect(client.stderr).toOutput('successfully provisioned');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('should use --name, --metadata, and slash syntax together', async () => {
      client.setArgv(
        'integration',
        'add',
        'acme-two-products/acme-a',
        '--name',
        'my-db',
        '--metadata',
        'version=5.4',
        '--metadata',
        'region=pdx1'
      );
      const exitCodePromise = integrationCommand(client);

      // Slash syntax selects product, --name provides name, --metadata provides config
      await expect(client.stderr).toOutput(
        `Installing Acme Product A by Acme Integration Two Products under ${team.slug}`
      );

      // Fully non-interactive — no product selection, no name prompt, no wizard
      await expect(client.stderr).toOutput(
        'Acme Product A successfully provisioned: my-db'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('should error when product slug not found', async () => {
      client.setArgv('integration', 'add', 'acme-two-products/nonexistent');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Product "nonexistent" not found. Available products: acme-a, acme-b'
      );
    });

    it('should error on empty product slug after slash', async () => {
      client.setArgv('integration', 'add', 'acme/');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Invalid format. Expected: <integration-name>/<product-slug>'
      );
    });

    it('should error on empty integration slug before slash', async () => {
      client.setArgv('integration', 'add', '/product');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Invalid format. Expected: <integration-name>/<product-slug>'
      );
    });

    it('should work with single-product integration and explicit slug', async () => {
      client.setArgv('integration', 'add', 'acme/acme');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput(
        `Installing Acme Product by Acme Integration under ${team.slug}`
      );

      // Auto-generated name, server fills metadata defaults — no wizard prompts
      await expect(client.stderr).toOutput('successfully provisioned');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });
  });
});
