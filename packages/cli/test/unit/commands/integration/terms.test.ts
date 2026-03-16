import { beforeEach, describe, expect, it } from 'vitest';
import integrationCommand from '../../../../src/commands/integration';
import { client } from '../../../mocks/client';
import { useTeams, type Team } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';

function useIntegrationFetch() {
  client.scenario.get(
    '/:version/integrations/integration/:slug',
    (req, res) => {
      const { slug } = req.params;
      if (slug === 'acme') {
        res.json({
          id: 'acme',
          name: 'Acme Integration',
          slug: 'acme',
          eulaDocUri: 'https://example.com/eula',
          privacyDocUri: 'https://example.com/privacy',
          products: [
            {
              id: 'acme-product',
              name: 'Acme Product',
              slug: 'acme',
              type: 'storage',
              shortDescription: 'The Acme product',
              metadataSchema: { type: 'object', properties: {} },
            },
          ],
        });
      } else if (slug === 'minimal') {
        res.json({
          id: 'minimal',
          name: 'Minimal Integration',
          slug: 'minimal',
          products: [],
        });
      } else {
        res.status(404).json({ error: { message: 'Not found' } });
      }
    }
  );
}

describe('integration terms', () => {
  let team: Team;

  beforeEach(() => {
    useUser();
    const teams = useTeams('team_dummy');
    team = Array.isArray(teams) ? teams[0] : teams.teams[0];
    client.config.currentTeam = team.id;
  });

  describe('view mode (no --accept)', () => {
    beforeEach(() => {
      useIntegrationFetch();
    });

    it('should display terms for integration with all policy types', async () => {
      client.setArgv('integration', 'terms', 'acme');
      const exitCode = await integrationCommand(client);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Terms for "Acme Integration"');
      expect(stderr).toContain('Vercel Marketplace End User Addendum');
      expect(stderr).toContain('https://example.com/privacy');
      expect(stderr).toContain('https://example.com/eula');
      expect(stderr).toContain('These terms are legal agreements.');
      expect(stderr).toContain('vercel integration terms acme --accept');
      expect(exitCode).toEqual(0);
    });

    it('should display only Marketplace Addendum when no privacy/eula URIs', async () => {
      client.setArgv('integration', 'terms', 'minimal');
      const exitCode = await integrationCommand(client);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Terms for "Minimal Integration"');
      expect(stderr).toContain('Vercel Marketplace End User Addendum');
      expect(stderr).not.toContain('Privacy Policy');
      expect(stderr).not.toContain('Terms of Service');
      expect(exitCode).toEqual(0);
    });

    it('should output JSON when --format=json is specified', async () => {
      client.setArgv('integration', 'terms', 'acme', '--format=json');
      const exitCode = await integrationCommand(client);

      const jsonOutput = JSON.parse(client.stdout.getFullOutput());
      expect(jsonOutput.integration).toEqual('acme');
      expect(jsonOutput.terms).toHaveLength(3);
      expect(jsonOutput.terms[0].type).toEqual('toc');
      expect(jsonOutput.terms[1].type).toEqual('privacy');
      expect(jsonOutput.terms[2].type).toEqual('eula');
      expect(jsonOutput.userReviewRequired).toEqual(true);
      expect(jsonOutput.acceptCommand).toContain(
        'integration terms acme --accept'
      );
      expect(exitCode).toEqual(0);
    });

    it('should error when no integration slug provided', async () => {
      client.setArgv('integration', 'terms');
      const exitCode = await integrationCommand(client);

      await expect(client.stderr).toOutput('You must specify an integration');
      expect(exitCode).toEqual(1);
    });

    it('should error when integration not found', async () => {
      client.setArgv('integration', 'terms', 'nonexistent');
      const exitCode = await integrationCommand(client);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Failed to fetch integration "nonexistent"');
      expect(exitCode).toEqual(1);
    });
  });

  describe('accept mode (--accept)', () => {
    let installRequestBodies: unknown[];

    beforeEach(() => {
      installRequestBodies = [];
      useIntegrationFetch();

      client.scenario.post(
        '/v2/integrations/integration/:integrationId/marketplace/install',
        (req, res) => {
          installRequestBodies.push(req.body);
          res.json({ id: `${req.params.integrationId}-new-install` });
        }
      );
    });

    it('should accept terms and call install API', async () => {
      client.setArgv('integration', 'terms', 'acme', '--accept');
      const exitCode = await integrationCommand(client);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Terms accepted for "Acme Integration"');
      expect(exitCode).toEqual(0);
      expect(installRequestBodies).toHaveLength(1);

      const body = installRequestBodies[0] as Record<string, unknown>;
      const policies = body.acceptedPolicies as Record<string, string>;
      expect(policies.toc).toBeDefined();
      expect(policies.privacy).toBeDefined();
      expect(policies.eula).toBeDefined();
      expect(body.source).toEqual('cli');
    });

    it('should accept terms with only toc when no privacy/eula URIs', async () => {
      client.setArgv('integration', 'terms', 'minimal', '--accept');
      const exitCode = await integrationCommand(client);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Terms accepted for "Minimal Integration"');
      expect(exitCode).toEqual(0);
      expect(installRequestBodies).toHaveLength(1);

      const body = installRequestBodies[0] as Record<string, unknown>;
      const policies = body.acceptedPolicies as Record<string, string>;
      expect(policies.toc).toBeDefined();
      expect(policies.privacy).toBeUndefined();
      expect(policies.eula).toBeUndefined();
    });

    it('should output JSON on accept with --format=json', async () => {
      client.setArgv(
        'integration',
        'terms',
        'acme',
        '--accept',
        '--format=json'
      );
      const exitCode = await integrationCommand(client);

      const jsonOutput = JSON.parse(client.stdout.getFullOutput());
      expect(jsonOutput.accepted).toEqual(true);
      expect(jsonOutput.integration).toEqual('acme');
      expect(jsonOutput.terms).toHaveLength(3);
      expect(exitCode).toEqual(0);
    });
  });

  describe('accept mode - API failure', () => {
    beforeEach(() => {
      useIntegrationFetch();

      client.scenario.post(
        '/v2/integrations/integration/:integrationId/marketplace/install',
        (_req, res) => {
          res.status(500).json({ error: { message: 'Internal Server Error' } });
        }
      );
    });

    it('should error on install API failure during accept', async () => {
      client.setArgv('integration', 'terms', 'acme', '--accept');
      const exitCode = await integrationCommand(client);

      const stderr = client.stderr.getFullOutput();
      expect(stderr).toContain('Failed to accept terms for "acme"');
      expect(exitCode).toEqual(1);
    });
  });
});
