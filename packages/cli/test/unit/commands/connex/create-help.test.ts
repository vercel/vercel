import { describe, beforeEach, expect, it } from 'vitest';
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
    const out = client.stderr.getFullOutput();

    expect(exitCode).toBe(0);
    expect(out).toContain('Connection methods for Notion:');
    expect(out).toContain('oauth  OAuth 2.0 — bring your own credentials');
    expect(out).toContain('mcp  MCP — automatic registration');
    expect(out).toContain('api-key  API key — bring your own credentials');
  });

  it('drops the flag reference and points at the command help instead', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv('connect', 'create', 'notion', '--help');
    await connect(client);
    const out = client.stderr.getFullOutput();

    // The service is the answer here; the flag matrix lives one keystroke away.
    expect(out).not.toContain('Global Options:');
    expect(out).not.toContain('--background-color <HEX>');
    expect(out).not.toContain('--cwd <DIR>');
    expect(out).toContain(
      'Run `vercel connect create --help` for all options.'
    );
    // The synopsis and description still orient the reader. It reads
    // `create service` without `[options]` because the flag list moved,
    // which is consistent with the pointer line above.
    expect(out).toContain('vercel connect create service');
    expect(out).toContain('Create a new connector');
  });

  it('keeps the full flag reference on the service-less help', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv('connect', 'create', '--help');
    await connect(client);
    const out = client.stderr.getFullOutput();

    expect(out).toContain('Global Options:');
    expect(out).toContain('--background-color <HEX>');
    expect(out).not.toContain('for all options.');
  });

  it('lists the products a multi-target service exposes', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv('connect', 'create', 'notion', '--help');
    await connect(client);
    const out = client.stderr.getFullOutput();

    expect(out).toContain('Notion products:');
    expect(out).toContain('api  Notion API');
    expect(out).toContain('mcp  Notion MCP');
    expect(out).toContain('Connects to: Notion API');
  });

  it('frames --data as opt-out for a method that also registers automatically', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv('connect', 'create', 'notion', '--help');
    await connect(client);
    const out = client.stderr.getFullOutput();

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
    const out = client.stderr.getFullOutput();

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
    const out = client.stderr.getFullOutput();

    expect(out).toContain('--param domain=<value>');
    expect(out).toContain('Okta domain · e.g. acme.okta.com');
    expect(out).toContain('--param auth_server_id=<value>');
    expect(out).toContain('Authorization Server ID · default: default');
    expect(out).toContain('--data with clientId (required), clientSecret');
  });

  it('emits a runnable example per method', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv('connect', 'create', 'notion', '--help');
    await connect(client);
    const out = client.stderr.getFullOutput();

    // Managed methods need no credentials, manual ones do.
    expect(out).toContain(
      '$ vercel connect create notion --connection-method mcp --name notion-mcp'
    );
    expect(out).toContain(
      '$ vercel connect create notion --connection-method oauth --name notion-oauth --data @credentials.json'
    );
    // The generic static examples are replaced, not appended.
    expect(out).not.toContain('connect create slack --name my-bot --triggers');
  });

  it('builds template-param examples from the field placeholders', async () => {
    useConnexServices(client, { okta: oktaServiceInfo });

    client.setArgv('connect', 'create', 'okta', '--help');
    await connect(client);

    expect(client.stderr.getFullOutput()).toContain(
      '$ vercel connect create okta --connection-method custom-server --param domain=acme.okta.com --param auth_server_id=default --name okta-custom-server --data @credentials.json'
    );
  });

  it('falls back to static help for a service with no connection methods', async () => {
    useConnexServices(client, { github: githubServiceInfo });

    client.setArgv('connect', 'create', 'github', '--help');
    const exitCode = await connect(client);
    const out = client.stderr.getFullOutput();

    expect(exitCode).toBe(0);
    expect(out).not.toContain('Connection methods for');
    expect(out).toContain('Create a Slack app');
  });

  it('falls back to static help for an unknown service', async () => {
    useConnexServices(client, {});

    client.setArgv('connect', 'create', 'nope', '--help');
    const exitCode = await connect(client);

    expect(exitCode).toBe(0);
    expect(client.stderr.getFullOutput()).not.toContain(
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
    expect(client.stderr.getFullOutput()).toContain(
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
    const out = client.stderr.getFullOutput();

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
    expect(client.stderr.getFullOutput()).toContain('Create a new connector');
  });

  it('ignores flags when looking for the service argument', async () => {
    const { requests } = useConnexServices(client, {
      notion: notionServiceInfo,
    });

    client.setArgv('connect', 'create', '--json', 'notion', '--help');
    await connect(client);

    expect(requests).toHaveLength(1);
    expect(client.stderr.getFullOutput()).toContain(
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
    expect(client.stderr.getFullOutput()).toContain(
      'Connection methods for Notion:'
    );
  });
});
