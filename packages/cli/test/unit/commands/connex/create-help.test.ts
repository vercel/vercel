import stripAnsi from 'strip-ansi';
import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import connect from '../../../../src/commands/connex';
import {
  githubServiceInfo,
  notionServiceInfo,
  oktaServiceInfo,
  useConnexServices,
} from '../../../mocks/connex';

describe('connex create --help', () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    true,
    false,
  ])('uses stdout capabilities for every dynamic section (TTY=%s)', async tty => {
    vi.stubEnv('NO_COLOR', '');
    vi.stubEnv('FORCE_COLOR', '1');
    vi.stubEnv('TERM', 'xterm-256color');
    client.stdout.isTTY = tty;
    client.stderr.isTTY = !tty;
    useConnexServices(client, {
      notion: {
        ...notionServiceInfo,
        connectionMethods: (notionServiceInfo.connectionMethods ?? []).map(
          (method, index) =>
            index
              ? method
              : {
                  ...method,
                  templateFields: [
                    { key: 'domain', label: 'Domain', placeholder: 'example' },
                  ],
                }
        ),
      },
    });
    client.setArgv('connect', 'create', 'notion', '--help');
    expect(await connect(client)).toBe(0);
    const text = client.stdout.getFullOutput();
    expect(text.includes('\u001b[1m--param\u001b[22m')).toBe(tty);
    expect(
      text.includes('\u001b[1m\u001b[35mNotion products:\u001b[39m\u001b[22m')
    ).toBe(tty);
    expect(text.includes('\u001b[36mvercel connect create')).toBe(tty);
    expect(text.includes('\u001b')).toBe(tty);
  });

  it('keeps remote example values inert and labels substitutions', async () => {
    const methods = notionServiceInfo.connectionMethods ?? [];
    useConnexServices(client, {
      notion: {
        ...notionServiceInfo,
        connectionMethods: [
          {
            ...methods[0],
            templateFields: [
              {
                key: 'domain',
                label: 'Domain',
                placeholder: '$(unexpected command)',
              },
            ],
          },
        ],
      },
    });
    client.setArgv('connect', 'create', 'notion', '--help');
    expect(await connect(client)).toBe(0);
    const text = stripAnsi(client.stdout.getFullOutput());
    expect(text).toContain('▲ vercel connect create <service>');
    const examples = text.slice(text.indexOf('Examples:'));
    expect(examples).toContain('--param domain=<VALUE>');
    expect(examples).not.toContain('replace placeholders');
    expect(examples).not.toContain('$(unexpected command)');
    expect(examples).not.toMatch(/^\s*\$ /m);
  });

  beforeEach(() => {
    client.reset();
    useUser();
    const team = useTeam();
    client.config.currentTeam = team.id;
  });

  it('describes the connection methods a service publishes', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv('connect', 'create', 'notion', '--help');
    const exitCode = await connect(client);
    const out = stripAnsi(client.stdout.getFullOutput());

    expect(exitCode).toBe(0);
    expect(out).not.toMatch(/^\s*\$ /m);
    expect(out).toContain('Connection methods for Notion:');
    expect(out).toMatch(/oauth\s+OAuth 2\.0 — bring your own credentials/);
    expect(out).toMatch(/mcp\s+MCP — automatic registration/);
    expect(out).toContain('api-key  API key — bring your own credentials');
  });

  it('drops the flag reference and points at the command help instead', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv('connect', 'create', 'notion', '--help');
    await connect(client);
    const out = stripAnsi(client.stdout.getFullOutput());

    // The service is the answer here; the flag matrix lives one keystroke away.
    expect(out).not.toContain('Global Options:');
    expect(out).not.toContain('--background-color <HEX>');
    expect(out).not.toContain('--cwd <DIR>');
    expect(out).toContain('Show all command options');
    // The synopsis and description still orient the reader. It reads
    // `create service` without `[options]` because the flag list moved,
    // which is consistent with the pointer line above.
    expect(out).toContain('vercel connect create <service>');
    expect(out).toContain('Create a new connector');
  });

  it('closes with the Vercel Connect guide', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv('connect', 'create', 'notion', '--help');
    await connect(client);
    const out = stripAnsi(client.stdout.getFullOutput());

    const link = out.indexOf('Vercel Connect guide:');
    expect(link).toBeGreaterThan(-1);
    expect(link).toBeGreaterThan(out.indexOf('Connection methods for Notion:'));
    expect(link).toBeGreaterThan(out.indexOf('Show all command options'));
    expect(
      out.match(/https:\/\/vercel\.com\/kb\/guide\/vercel-connect/g)
    ).toHaveLength(1);
    expect(
      out.trimEnd().endsWith('https://vercel.com/kb/guide/vercel-connect')
    ).toBe(true);
  });

  it('keeps the full flag reference on the service-less help', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv('connect', 'create', '--help');
    await connect(client);
    const out = stripAnsi(client.stdout.getFullOutput());

    expect(out).toContain('Global Options:');
    expect(out).toContain('--background-color <HEX>');
    expect(out).not.toContain('Show all command options');
  });

  it('lists the products a multi-target service exposes', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv('connect', 'create', 'notion', '--help');
    await connect(client);
    const out = stripAnsi(client.stdout.getFullOutput());

    expect(out).toContain('Notion products:');
    expect(out).toContain('api  Notion API');
    expect(out).toContain('mcp  Notion MCP');
    expect(out).toContain('Connects to: Notion API');
  });

  it('frames --data as opt-out for a method that also registers automatically', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv('connect', 'create', 'notion', '--help');
    await connect(client);
    const out = stripAnsi(client.stdout.getFullOutput());

    // `mcp` offers both paths, so --data is an alternative, not a requirement.
    expect(out).toContain(
      'Or bring your own: --data with clientId (required), clientSecret'
    );
    expect(out).toContain('--data with values: [{ "value": "<api key>" }]');
  });

  it('carries the provider setup note, with markdown flattened', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv('connect', 'create', 'notion', '--help');
    await connect(client);
    const out = stripAnsi(client.stdout.getFullOutput());

    expect(out).toContain(
      'Create an integration token at https://app.notion.com/developers/tokens'
    );
    // Bold survives as text, not as asterisks.
    expect(out).toContain('Create a public integration');
    expect(out).not.toContain('**public**');
  });

  it('names the credentials and template params each method needs', async () => {
    useConnexServices(client, { okta: oktaServiceInfo });

    client.setArgv('connect', 'create', 'okta', '--help');
    await connect(client);
    const out = stripAnsi(client.stdout.getFullOutput());

    expect(out).toContain('--param domain=<VALUE>');
    expect(out).toContain('Okta domain · e.g. acme.okta.com');
    expect(out).toContain('--param auth_server_id=<VALUE>');
    expect(out).toContain('Authorization Server ID (default: default)');
    expect(out).not.toContain('· default:');
    expect(out).toContain('--data with clientId (required), clientSecret');
  });

  it('emits a complete command or template per method', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv('connect', 'create', 'notion', '--help');
    await connect(client);
    const out = stripAnsi(client.stdout.getFullOutput());

    // Managed methods need no credentials, manual ones do.
    expect(out).toContain(
      'vercel connect create notion --connection-method mcp --name notion-mcp'
    );
    expect(out).toContain(
      'vercel connect create notion --connection-method oauth --name notion-oauth --data "@<CREDENTIALS_FILE>"'
    );
    // The generic static examples are replaced, not appended.
    expect(out).not.toContain('connect create slack --name my-bot --triggers');
  });

  it('uses field defaults and labels values requiring substitution', async () => {
    useConnexServices(client, { okta: oktaServiceInfo });

    client.setArgv('connect', 'create', 'okta', '--help');
    await connect(client);

    expect(stripAnsi(client.stdout.getFullOutput())).toContain(
      'vercel connect create okta --connection-method custom-server --param domain=<VALUE> --param auth_server_id=default --name okta-custom-server --data "@<CREDENTIALS_FILE>"'
    );
  });

  it('falls back to static help for a service with no connection methods', async () => {
    useConnexServices(client, { github: githubServiceInfo });

    client.setArgv('connect', 'create', 'github', '--help');
    const exitCode = await connect(client);
    const out = stripAnsi(client.stdout.getFullOutput());

    expect(exitCode).toBe(0);
    expect(out).not.toContain('Connection methods for');
    expect(out).toContain('Create a Slack app');
  });

  it('falls back to static help for an unknown service', async () => {
    useConnexServices(client, {});

    client.setArgv('connect', 'create', 'nope', '--help');
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(stripAnsi(client.stdout.getFullOutput())).not.toContain(
      'Connection methods for'
    );
  });

  it('retries without the team when the configured one is not authorized', async () => {
    const seen: string[] = [];
    client.scenario.get('/v1/connect/services/:service', (req, res) => {
      seen.push(req.url ?? '');
      // A stale `currentTeam` 403s every team-scoped route. Help still has to
      // work — the registry is provider facts.
      if ((req.url ?? '').includes('teamId=')) {
        res.statusCode = 403;
        res.json({ error: { code: 'forbidden', message: 'Not authorized' } });
        return;
      }
      res.json(notionServiceInfo);
    });

    client.setArgv('connect', 'create', 'notion', '--help');
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(seen).toHaveLength(2);
    expect(seen[1]).not.toContain('teamId=');
    expect(stripAnsi(client.stdout.getFullOutput())).toContain(
      'Connection methods for Notion:'
    );
  });

  it('falls back to static help when the API is unreachable', async () => {
    client.scenario.get('/v1/connect/services/:service', (_req, res) => {
      res.statusCode = 500;
      res.json({ error: { code: 'internal', message: 'boom' } });
    });

    client.setArgv('connect', 'create', 'notion', '--help');
    const exitCode = await connect(client);
    const out = stripAnsi(client.stdout.getFullOutput());

    // --help must not start depending on a working API connection.
    expect(exitCode).toBe(0);
    expect(out).not.toContain('Connection methods for');
    expect(out).toContain('Create a new connector');
  });

  it('prints static help and makes no request without a service', async () => {
    const { requests } = useConnexServices(client, {
      notion: notionServiceInfo,
    });

    client.setArgv('connect', 'create', '--help');
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(requests).toHaveLength(0);
    expect(stripAnsi(client.stdout.getFullOutput())).toContain(
      'Create a new connector'
    );
  });

  it('ignores flags when looking for the service argument', async () => {
    const { requests } = useConnexServices(client, {
      notion: notionServiceInfo,
    });

    client.setArgv('connect', 'create', '--json', 'notion', '--help');
    await connect(client);

    expect(requests).toHaveLength(1);
    expect(stripAnsi(client.stdout.getFullOutput())).toContain(
      'Connection methods for Notion:'
    );
  });

  it('does not mistake a flag value for the service', async () => {
    const { requests } = useConnexServices(client, {
      notion: notionServiceInfo,
    });

    client.setArgv('connect', 'create', '--name', 'my-bot', 'notion', '--help');
    await connect(client);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain('/v1/connect/services/notion');
    expect(stripAnsi(client.stdout.getFullOutput())).toContain(
      'Connection methods for Notion:'
    );
  });
});
