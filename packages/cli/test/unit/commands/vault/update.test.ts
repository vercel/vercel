import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import { useProject } from '../../../mocks/project';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';
import update from '../../../../src/commands/vault/update';

describe('vault update', () => {
  beforeEach(() => {
    client.reset();
  });

  describe('with project context', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_test_vault');
      useProject({
        id: 'prj_test_vault_update',
        name: 'vault-test',
      });
      const cwd = setupUnitFixture('vercel-vault-update');
      client.cwd = cwd;
    });

    it('should update a project-specific secret with interactive prompts', async () => {
      // Mock interactive inputs
      client.input.text = vi
        .fn()
        .mockResolvedValueOnce('my-secret') // secret name
        .mockResolvedValueOnce('DB_HOST') // first key
        .mockResolvedValueOnce('newhost.com') // first value
        .mockResolvedValueOnce('DB_PORT') // second key
        .mockResolvedValueOnce('5433') // second value
        .mockResolvedValueOnce(''); // empty to finish

      // Mock API response
      client.fetch = vi.fn().mockResolvedValue({
        data: { DB_HOST: 'newhost.com', DB_PORT: '5433' },
        metadata: { version: 1, createdAt: Date.now() },
      });

      const exitCode = await update(client, []);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/v1\/vault\/team_test_vault\/data\/my-secret/),
        expect.objectContaining({
          method: 'PATCH',
          body: {
            data: {
              DB_HOST: 'newhost.com',
              DB_PORT: '5433',
            },
          },
        })
      );
    });

    it('should accept secret name as argument', async () => {
      client.input.text = vi
        .fn()
        .mockResolvedValueOnce('API_KEY') // first key
        .mockResolvedValueOnce('new-secret-value') // first value
        .mockResolvedValueOnce(''); // empty to finish

      client.fetch = vi.fn().mockResolvedValue({
        data: { API_KEY: 'new-secret-value' },
        metadata: { version: 1, createdAt: Date.now() },
      });

      const exitCode = await update(client, ['database-config']);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/v1\/vault\/team_test_vault\/data\/database-config/
        ),
        expect.anything()
      );
    });

    it('should include environment query parameter', async () => {
      client.setArgv(
        'vault',
        'update',
        'my-secret',
        '--environment',
        'preview'
      );

      client.input.text = vi
        .fn()
        .mockResolvedValueOnce('KEY') // first key
        .mockResolvedValueOnce('value') // first value
        .mockResolvedValueOnce(''); // empty to finish

      client.fetch = vi.fn().mockResolvedValue({
        data: { KEY: 'value' },
        metadata: { version: 1, createdAt: Date.now() },
      });

      const exitCode = await update(client, [
        'my-secret',
        '--environment',
        'preview',
      ]);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/environment=PREVIEW/),
        expect.anything()
      );
    });

    it('should include project ID in query parameters', async () => {
      client.input.text = vi
        .fn()
        .mockResolvedValueOnce('KEY')
        .mockResolvedValueOnce('value')
        .mockResolvedValueOnce('');

      client.fetch = vi.fn().mockResolvedValue({
        data: { KEY: 'value' },
        metadata: { version: 1, createdAt: Date.now() },
      });

      const exitCode = await update(client, ['my-secret']);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/projectId=prj_test_vault_update/),
        expect.anything()
      );
    });

    it('should handle 404 error when secret does not exist', async () => {
      client.input.text = vi
        .fn()
        .mockResolvedValueOnce('KEY')
        .mockResolvedValueOnce('value')
        .mockResolvedValueOnce('');

      const notFoundError = new Error('Not found');
      (notFoundError as any).status = 404;
      client.fetch = vi.fn().mockRejectedValue(notFoundError);

      const exitCode = await update(client, ['nonexistent-secret']);

      expect(exitCode).toBe(1);
    });

    it('should handle general API errors', async () => {
      client.input.text = vi
        .fn()
        .mockResolvedValueOnce('KEY')
        .mockResolvedValueOnce('value')
        .mockResolvedValueOnce('');

      client.fetch = vi.fn().mockRejectedValue(new Error('API Error'));

      const exitCode = await update(client, ['my-secret']);

      expect(exitCode).toBe(1);
    });

    it('should require at least one key-value pair', async () => {
      client.input.text = vi
        .fn()
        .mockResolvedValueOnce('') // empty key (first attempt)
        .mockResolvedValueOnce('KEY') // try again with valid key
        .mockResolvedValueOnce('value')
        .mockResolvedValueOnce('');

      client.fetch = vi.fn().mockResolvedValue({
        data: { KEY: 'value' },
        metadata: { version: 1, createdAt: Date.now() },
      });

      const exitCode = await update(client, ['my-secret']);

      expect(exitCode).toBe(0);
    });
  });

  describe('with global flag', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_test_vault');
      client.config.currentTeam = 'team_test_vault';
    });

    it('should update a global (team-level) secret', async () => {
      client.setArgv('vault', 'update', 'shared-key', '--global');

      client.input.text = vi
        .fn()
        .mockResolvedValueOnce('API_KEY')
        .mockResolvedValueOnce('updated-global-value')
        .mockResolvedValueOnce('');

      client.fetch = vi.fn().mockResolvedValue({
        data: { API_KEY: 'updated-global-value' },
        metadata: { version: 1, createdAt: Date.now() },
      });

      const exitCode = await update(client, ['shared-key', '--global']);

      expect(exitCode).toBe(0);
      expect(client.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/projectId=&/), // empty projectId
        expect.objectContaining({
          method: 'PATCH',
        })
      );
    });

    it('should fail if no team is selected', async () => {
      client.config.currentTeam = undefined;
      client.setArgv('vault', 'update', 'shared-key', '--global');

      const exitCode = await update(client, ['shared-key', '--global']);

      expect(exitCode).toBe(1);
    });
  });

  describe('without project link', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_test_vault');
      const cwd = setupUnitFixture('vercel-vault-update');
      client.cwd = cwd;
    });

    it('should fail if not linked and not using global flag', async () => {
      client.setArgv('vault', 'update', 'my-secret');

      const exitCode = await update(client, ['my-secret']);

      expect(exitCode).toBe(1);
    });
  });

  describe('argument validation', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_test_vault');
      useProject({
        id: 'prj_test_vault_update',
        name: 'vault-test',
      });
      const cwd = setupUnitFixture('vercel-vault-update');
      client.cwd = cwd;
    });

    it('should reject too many arguments', async () => {
      const exitCode = await update(client, ['secret1', 'secret2']);

      expect(exitCode).toBe(1);
    });
  });
});
