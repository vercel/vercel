import { beforeEach, describe, expect, it, vi } from 'vitest';
import open from 'open';
import integrationCommand from '../../../../src/commands/integration';
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

const openMock = vi.mocked(open);

beforeEach(() => {
  openMock.mockClear();
  // Enable auto-provision feature flag
  process.env.FF_AUTO_PROVISION_INSTALL = '1';
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

      await expect(client.stderr).toOutput('What is the name of the resource?');
      client.stdin.write('test-resource\n');

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).not.toHaveBeenCalled();
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

      await expect(client.stderr).toOutput('What is the name of the resource?');
      client.stdin.write('test-resource\n');

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned'
      );

      await expect(client.stderr).toOutput(
        'Do you want to link this resource to the current project?'
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Select environments');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Connected to vercel-integration-add'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).not.toHaveBeenCalled();
    });

    it('should provision without connecting when user declines', async () => {
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;
      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput('What is the name of the resource?');
      client.stdin.write('test-resource\n');

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned'
      );

      await expect(client.stderr).toOutput(
        'Do you want to link this resource to the current project?'
      );
      client.stdin.write('n\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('should track telemetry', async () => {
      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput('What is the name of the resource?');
      client.stdin.write('test-resource\n');

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

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
          key: 'argument:name',
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

      await expect(client.stderr).toOutput('What is the name of the resource?');
      client.stdin.write('test-resource\n');

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Accept privacy policy?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput('Accept terms of service?');
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });

    it('should exit with code 1 when privacy policy declined', async () => {
      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput('What is the name of the resource?');
      client.stdin.write('test-resource\n');

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

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

      await expect(client.stderr).toOutput('What is the name of the resource?');
      client.stdin.write('test-resource\n');

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

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

      await expect(client.stderr).toOutput('What is the name of the resource?');
      client.stdin.write('test-resource\n');

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

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
        expect.stringMatching(/defaultResourceName=test-resource/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/source=cli/)
      );
    });

    it('should open browser for unknown fallback', async () => {
      useAutoProvision({ responseKey: 'unknown' });

      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput('What is the name of the resource?');
      client.stdin.write('test-resource\n');

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).toHaveBeenCalled();
    });

    it('should include projectSlug when user consents to link project', async () => {
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

      await expect(client.stderr).toOutput('What is the name of the resource?');
      client.stdin.write('test-resource\n');

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Do you want to link this resource to the current project?'
      );
      client.stdin.write('y\n');

      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/projectSlug=vercel-integration-add/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/source=cli/)
      );
    });

    it('should not include projectSlug when user declines to link project', async () => {
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

      await expect(client.stderr).toOutput('What is the name of the resource?');
      client.stdin.write('test-resource\n');

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Do you want to link this resource to the current project?'
      );
      client.stdin.write('n\n');

      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).toHaveBeenCalledWith(
        expect.not.stringMatching(/projectSlug=/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/source=cli/)
      );
    });
  });

  describe('errors', () => {
    beforeEach(() => {
      useAutoProvision({ responseKey: 'provisioned' });
    });

    it('should reject empty resource name', async () => {
      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput('What is the name of the resource?');
      client.stdin.write('\n'); // Empty input

      await expect(client.stderr).toOutput('Resource name is required');

      // Provide valid name to continue
      client.stdin.write('valid-name\n');

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
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

    it('should prompt for product selection when multiple products', async () => {
      client.setArgv('integration', 'add', 'acme-two-products');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput('Select a product');
      client.stdin.write('\n'); // Select first product

      await expect(client.stderr).toOutput('What is the name of the resource?');
      client.stdin.write('test-resource\n');

      // acme-two-products uses metadataSchema2 which has version and region
      await expect(client.stderr).toOutput('Version');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Region');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('successfully provisioned');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });
  });

  describe('--format=json', () => {
    beforeEach(() => {
      useAutoProvision({ responseKey: 'provisioned' });
    });

    it('should output JSON when --format=json is passed', async () => {
      client.setArgv('integration', 'add', 'acme', '--format=json');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput('What is the name of the resource?');
      client.stdin.write('test-resource\n');

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      // Verify JSON output was written to stdout
      const stdoutOutput = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(stdoutOutput);

      expect(jsonOutput).toMatchObject({
        resource: {
          id: 'resource_123',
          name: 'test-resource',
          status: 'available',
        },
        integration: {
          id: 'acme',
          slug: 'acme',
          name: 'Acme Integration',
        },
        product: {
          id: 'acme-product',
          slug: 'acme',
          name: 'Acme Product',
        },
      });
    });

    it('should not prompt for project linking in JSON mode', async () => {
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;

      client.setArgv('integration', 'add', 'acme', '--format=json');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput('What is the name of the resource?');
      client.stdin.write('test-resource\n');

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      // Verify JSON output - no project linking prompt should appear
      const stdoutOutput = client.stdout.getFullOutput();
      const jsonOutput = JSON.parse(stdoutOutput);
      expect(jsonOutput.resource.id).toEqual('resource_123');
    });

    it('should error with invalid format value', async () => {
      client.setArgv('integration', 'add', 'acme', '--format=xml');
      const exitCode = await integrationCommand(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput('Invalid output format');
    });
  });
});
