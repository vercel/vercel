import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
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

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
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

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Acme Product successfully provisioned: acme-gray-apple'
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

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

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

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

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
        expect.stringMatching(/defaultResourceName=acme-gray-apple/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/source=cli/)
      );
    });

    it('should open browser for unknown fallback', async () => {
      useAutoProvision({ responseKey: 'unknown' });

      client.setArgv('integration', 'add', 'acme');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput(
        'Additional setup required. Opening browser...'
      );

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
      expect(openMock).toHaveBeenCalled();
    });

    it('should include all three URL params (projectSlug, defaultResourceName, source) when user consents to link project', async () => {
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

    it('should include defaultResourceName and source but not projectSlug when user declines to link project', async () => {
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

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

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

    it('should include custom --name and projectSlug in URL when user accepts project link', async () => {
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
        expect.stringMatching(/defaultResourceName=my-proj-db/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/projectSlug=vercel-integration-add/)
      );
      expect(openMock).toHaveBeenCalledWith(
        expect.stringMatching(/source=cli/)
      );
    });

    it('should include custom --name but not projectSlug in URL when user declines project link', async () => {
      useAutoProvision({ responseKey: 'metadata' });
      useProject({
        ...defaultProject,
        id: 'vercel-integration-add',
        name: 'vercel-integration-add',
      });
      const cwd = setupUnitFixture('vercel-integration-add');
      client.cwd = cwd;

      client.setArgv('integration', 'add', 'acme', '--name', 'my-nolink-db');
      const exitCodePromise = integrationCommand(client);

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

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

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

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

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

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

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

    it('should prompt for product selection when multiple products', async () => {
      client.setArgv('integration', 'add', 'acme-two-products');
      const exitCodePromise = integrationCommand(client);

      await expect(client.stderr).toOutput('Select a product');
      client.stdin.write('\n'); // Select first product

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

      await expect(client.stderr).toOutput('Version');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Region');
      client.stdin.write('\n');

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

      await expect(client.stderr).toOutput('Version');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('Region');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('successfully provisioned');

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

      await expect(client.stderr).toOutput('Choose your region');
      client.stdin.write('\n');

      await expect(client.stderr).toOutput('successfully provisioned');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);
    });
  });
});
