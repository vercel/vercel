import { Response } from 'node-fetch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import oauthApps from '../../../../src/commands/oauth-apps';
import getScope from '../../../../src/util/get-scope';
import { APIError } from '../../../../src/util/errors-ts';
import { client } from '../../../mocks/client';

vi.mock('../../../../src/util/get-scope', () => ({
  default: vi.fn(),
}));

describe('oauth-apps', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('install', () => {
    beforeEach(() => {
      vi.mocked(getScope).mockResolvedValue({
        contextName: 'acme',
        team: { id: 'team_oauth_install', slug: 'acme' } as any,
        user: {} as any,
      });
    });

    it('writes structured JSON with hint and next when non-interactive and --client-id is missing', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv(
        '--cwd',
        '/tmp/oauth-test',
        '--non-interactive',
        'oauth-apps',
        'install'
      );

      await expect(oauthApps(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_arguments',
        message: 'Missing --client-id',
      });
      expect(payload.hint).toMatch(/client id|cl_/i);
      expect(payload.next?.[0]?.command).toBe(
        'vercel --cwd /tmp/oauth-test --non-interactive oauth-apps list-requests --format=json'
      );
      expect(payload.next?.[1]?.command).toBe(
        'vercel --cwd /tmp/oauth-test --non-interactive oauth-apps install --client-id <client-id> --permission <scope>'
      );
    });

    it('writes structured JSON with next including resolved client id when --permission is missing', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv(
        '--non-interactive',
        'oauth-apps',
        'install',
        '--client-id',
        'cl_test123'
      );

      await expect(oauthApps(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_arguments',
        message: 'Provide at least one --permission (repeatable)',
      });
      expect(payload.next?.[0]?.command).toBe(
        'vercel --non-interactive oauth-apps install --client-id cl_test123 --permission <scope>'
      );
    });
  });

  describe('invalid subcommand', () => {
    it('errors when the first token is not a known subcommand', async () => {
      client.setArgv('oauth-apps', 'not-a-command');

      const code = await oauthApps(client);
      expect(code).toBe(1);
      const err = client.stderr.getFullOutput();
      expect(err).toContain('Invalid oauth-apps subcommand');
      expect(err).toContain('not-a-command');
    });
  });

  describe('register', () => {
    beforeEach(() => {
      vi.mocked(getScope).mockResolvedValue({
        contextName: 'acme',
        team: { id: 'team_testoauth', slug: 'acme' } as any,
        user: {} as any,
      });
    });

    it('writes structured JSON when non-interactive and --name is missing', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv(
        '--non-interactive',
        'oauth-apps',
        'register',
        '--slug',
        'my-app'
      );

      await expect(oauthApps(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_arguments',
        message: 'Missing --name',
      });
      expect(payload.next?.[0]?.command).toBe(
        'vercel --non-interactive oauth-apps register --name <display-name> --slug <slug>'
      );
    });

    it('writes structured JSON when --slug has no value before another flag (arg parse error)', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv(
        '--non-interactive',
        'oauth-apps',
        'register',
        '--name',
        'display-name',
        '--slug',
        '--cwd=/tmp/proj'
      );

      await expect(oauthApps(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'invalid_arguments',
      });
      expect(payload.message).toMatch(/--slug/i);
      expect(payload.hint).toMatch(/slug|--cwd/i);
      expect(payload.next?.[0]?.command).toContain(
        "oauth-apps register --name 'display-name' --slug <slug>"
      );
    });

    it('writes structured JSON when non-interactive and --slug is missing', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      client.nonInteractive = true;
      client.setArgv(
        '--non-interactive',
        'oauth-apps',
        'register',
        '--name',
        'My App'
      );

      await expect(oauthApps(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_arguments',
        message: 'Missing --slug',
      });
      expect(payload.next?.[0]?.command).toBe(
        "vercel --non-interactive oauth-apps register --name 'My App' --slug <slug>"
      );
    });

    it('writes structured JSON when there is no team scope', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      vi.mocked(getScope).mockResolvedValueOnce({
        contextName: 'solo',
        team: null,
        user: {} as any,
      });

      client.nonInteractive = true;
      client.setArgv(
        '--non-interactive',
        'oauth-apps',
        'register',
        '--name',
        'My App',
        '--slug',
        'my-app'
      );

      await expect(oauthApps(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_scope',
      });
      expect(payload.next?.[1]?.command).toBe(
        "vercel --non-interactive oauth-apps register --name 'My App' --slug 'my-app'"
      );
    });

    it('POSTs /v1/oauth-apps and prints JSON when --format=json', async () => {
      const fetchSpy = vi.spyOn(client, 'fetch').mockResolvedValue({
        clientId: 'cl_regtest',
        name: 'My App',
        slug: 'my-app',
        redirectUris: ['https://example.com/cb'],
      });

      client.setArgv(
        'oauth-apps',
        'register',
        '--name',
        'My App',
        '--slug',
        'my-app',
        '--redirect-uri',
        'https://example.com/cb',
        '--format',
        'json'
      );

      const code = await oauthApps(client);
      expect(code).toBe(0);
      expect(fetchSpy).toHaveBeenCalledWith(
        '/v1/oauth-apps',
        expect.objectContaining({
          method: 'POST',
          body: {
            name: 'My App',
            slug: 'my-app',
            redirectUris: ['https://example.com/cb'],
          },
        })
      );
      const out = JSON.parse(client.stdout.getFullOutput().trim());
      expect(out.clientId).toBe('cl_regtest');
    });

    it('writes structured JSON API error when non-interactive and POST fails', async () => {
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error(`exit:${code ?? 0}`);
      }) as () => never);

      vi.spyOn(client, 'fetch').mockRejectedValue(
        new APIError(
          'App slug is already taken.',
          new Response(undefined, { status: 409 })
        )
      );

      client.nonInteractive = true;
      client.setArgv(
        '--non-interactive',
        'oauth-apps',
        'register',
        '--name',
        'display-name',
        '--slug',
        'slug'
      );

      await expect(oauthApps(client)).rejects.toThrow('exit:1');

      const payload = JSON.parse(client.stdout.getFullOutput().trim());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'api_error',
        message: 'App slug is already taken.',
      });
    });
  });
});
