import { describe, beforeEach, expect, it, vi } from 'vitest';
import open from 'open';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import connect from '../../../../src/commands/connex';
import {
  fakeConnexClient,
  mockConnexCreate,
  mockConnexManagedCreate,
  githubServiceInfo,
  notionServiceInfo,
  npmServiceInfo,
  oktaServiceInfo,
  slackServiceInfo,
  snowflakeServiceInfo,
  workosServiceInfo,
  useConnexServices,
} from '../../../mocks/connex';

vi.mock('open', () => ({ default: vi.fn(() => Promise.resolve()) }));
vi.setConfig({ testTimeout: 15000 });

describe('connex create connection methods', () => {
  let team: { id: string; slug: string };

  beforeEach(() => {
    client.reset();
    (open as unknown as ReturnType<typeof vi.fn>).mockClear();
    useUser();
    team = useTeam();
    client.config.currentTeam = team.id;
  });

  it('walks target then method then credentials for a manual OAuth method', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    const created = mockConnexCreate(client, {
      id: 'scl_notion_oauth',
      uid: 'notion/my-notion',
      type: 'oauth',
      service: 'notion',
      connectionMethod: 'oauth',
      target: 'api',
    });

    client.setArgv('connect', 'create', 'notion', '--name', 'my-notion');
    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput('What do you want to connect to?');
    client.stdin.write('\n');

    await expect(client.stderr).toOutput(
      'How do you want to connect to Notion?'
    );
    client.stdin.write('\n');

    await expect(client.stderr).toOutput(
      'Add https://connect.vercel.com/callback as a redirect URI in that app.'
    );
    await expect(client.stderr).toOutput('? Client ID');
    client.stdin.write('client-abc\n');

    await expect(client.stderr).toOutput('? Client Secret');
    client.stdin.write('secret-xyz\n');

    expect(await exitCodePromise).toBe(0);
    expect(created.body).toMatchObject({
      service: 'notion',
      connectionMethod: 'oauth',
      target: 'api',
      name: 'my-notion',
      data: { clientId: 'client-abc', clientSecret: 'secret-xyz' },
    });
    // The registry owns the type and the endpoints on the method path.
    expect(created.body.type).toBeUndefined();
    expect(created.body.data.serverConfig).toBeUndefined();
    expect(created.body.request_code).toBeUndefined();
    await expect(client.stderr).toOutput(
      'notion connector created via OAuth 2.0: scl_notion_oauth (UID notion/my-notion)'
    );
  });

  it('renders the register link and the method instructions before prompting', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    mockConnexCreate(client, { id: 'scl_g', uid: 'notion/g' });

    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'g',
      '--connection-method',
      'oauth'
    );
    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput(
      'Register an OAuth app for Notion at https://www.notion.so/my-integrations and copy its Client ID and Client Secret.'
    );
    await expect(client.stderr).toOutput(
      'Docs: https://developers.notion.com/docs/authorization'
    );
    // `**public**` renders as bold, not as literal asterisks.
    await expect(client.stderr).toOutput(
      "Create a public integration — internal integrations can't use OAuth."
    );

    await expect(client.stderr).toOutput('? Client ID');
    client.stdin.write('id\n');
    await expect(client.stderr).toOutput('? Client Secret');
    client.stdin.write('\n');

    expect(await exitCodePromise).toBe(0);
  });

  it('stays quiet about credentials when --data supplies them all', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    const created = mockConnexCreate(client, {
      id: 'scl_quiet',
      uid: 'notion/quiet',
    });

    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'quiet',
      '--connection-method',
      'oauth',
      '--data',
      '{"clientId":"ci","clientSecret":"cs"}'
    );

    expect(await connect(client)).toBe(0);
    expect(created.body.data).toEqual({ clientId: 'ci', clientSecret: 'cs' });

    // No prompt fires, so "paste it below" would be describing nothing.
    const out = client.stderr.getFullOutput();
    expect(out).not.toContain('Register an OAuth app for Notion');
    expect(out).not.toContain('as a redirect URI');
    expect(out).not.toContain('Create a public integration');
  });

  it('still explains where to get the half that --data omitted', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    mockConnexCreate(client, { id: 'scl_half', uid: 'notion/half' });

    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'half',
      '--connection-method',
      'oauth',
      '--data',
      '{"clientId":"ci"}'
    );
    const exitCodePromise = connect(client);

    // clientSecret is still prompted, so the guidance earns its place.
    await expect(client.stderr).toOutput('Register an OAuth app for Notion');
    await expect(client.stderr).toOutput('? Client Secret');
    client.stdin.write('cs\n');

    expect(await exitCodePromise).toBe(0);
  });

  it('omits clientSecret when the user leaves the public-client prompt blank', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    const created = mockConnexCreate(client, {
      id: 'scl_pub',
      uid: 'notion/pub',
    });

    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'pub',
      '--connection-method',
      'oauth'
    );
    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput('? Client ID');
    client.stdin.write('id-only\n');
    await expect(client.stderr).toOutput('? Client Secret');
    client.stdin.write('\n');

    expect(await exitCodePromise).toBe(0);
    expect(created.body.data).toEqual({ clientId: 'id-only' });
  });

  it('confirms a single method and routes it through managed create', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    let postBody: any;
    let manualHit = false;
    client.scenario.post('/v1/connect/connectors/managed', (req, res) => {
      postBody = req.body;
      res.json(
        fakeConnexClient({
          id: 'scl_notion_mcp',
          uid: 'notion/notion-mcp',
          type: 'oauth',
          service: 'notion',
          connectionMethod: 'mcp',
          target: 'mcp',
        })
      );
    });
    client.scenario.post('/v1/connect/connectors', (_req, res) => {
      manualHit = true;
      res.json(fakeConnexClient());
    });

    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'notion-mcp',
      '--target',
      'mcp'
    );
    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput(
      'Connect to Notion with MCP (automatic registration)?'
    );
    client.stdin.write('\n');

    expect(await exitCodePromise).toBe(0);
    expect(manualHit).toBe(false);
    expect(postBody).toMatchObject({
      service: 'notion',
      connectionMethod: 'mcp',
      target: 'mcp',
      name: 'notion-mcp',
    });
    expect(typeof postBody.request_code).toBe('string');
    await expect(client.stderr).toOutput(
      'notion connector created via MCP: scl_notion_mcp'
    );
  });

  it('cancels when the single-method confirmation is declined', async () => {
    useConnexServices(client, { npm: npmServiceInfo });

    client.setArgv('connect', 'create', 'npm', '--name', 'npm-token');
    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput(
      'Connect to npm with Access token (bring your own credentials)?'
    );
    client.stdin.write('n\n');

    expect(await exitCodePromise).toBe(1);
    await expect(client.stderr).toOutput('Canceled.');
  });

  it('skips the single-method confirmation with --yes', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    mockConnexManagedCreate(client, { id: 'scl_yes', uid: 'notion/yes' });

    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'yes',
      '--target',
      'mcp',
      '--yes'
    );

    expect(await connect(client)).toBe(0);
    expect(client.stderr.getFullOutput()).not.toContain('Continue?');
  });

  it('nests the api-key value and masks the prompt', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    const created = mockConnexCreate(client, {
      id: 'scl_notion_key',
      uid: 'notion/key',
      type: 'api-key',
    });

    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'key',
      '--connection-method',
      'api-key'
    );
    const exitCodePromise = connect(client);

    // The api-key family renders its instructions whole. The link text is
    // the URL, so it collapses to the URL alone instead of printing it twice.
    await expect(client.stderr).toOutput(
      'Create an integration token at https://app.notion.com/developers/tokens and paste it below.'
    );
    await expect(client.stderr).toOutput('? API key');
    client.stdin.write('ntn_supersecret\n');

    expect(await exitCodePromise).toBe(0);
    expect(created.body).toMatchObject({
      service: 'notion',
      connectionMethod: 'api-key',
      target: 'api',
      data: { values: [{ value: 'ntn_supersecret' }] },
    });
    // The typed value is masked and never echoed back.
    expect(client.stderr.getFullOutput()).not.toContain('ntn_supersecret');
  });

  it('prompts template fields and falls back to the field default', async () => {
    useConnexServices(client, { okta: oktaServiceInfo });
    const created = mockConnexCreate(client, {
      id: 'scl_okta',
      uid: 'okta/acme',
    });

    client.setArgv(
      'connect',
      'create',
      'okta',
      '--name',
      'acme',
      '--connection-method',
      'custom-server'
    );
    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput('? Okta domain');
    client.stdin.write('acme.okta.com\n');

    await expect(client.stderr).toOutput('? Authorization Server ID');
    // Empty input takes the field's default.
    client.stdin.write('\n');

    await expect(client.stderr).toOutput('? Client ID');
    client.stdin.write('okta-client\n');
    await expect(client.stderr).toOutput('? Client Secret');
    client.stdin.write('okta-secret\n');

    expect(await exitCodePromise).toBe(0);
    expect(created.body.params).toEqual({
      domain: 'acme.okta.com',
      auth_server_id: 'default',
    });
    expect(created.body.connectionMethod).toBe('custom-server');
    expect(created.body.target).toBeUndefined();
  });

  it('rejects a template value that could never be a hostname', async () => {
    useConnexServices(client, { workos: workosServiceInfo });
    mockConnexCreate(client, { id: 'scl_wo', uid: 'workos/wo' });

    client.setArgv('connect', 'create', 'workos', '--name', 'wo');
    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput('Connect to WorkOS with OAuth 2.0');
    client.stdin.write('\n');

    await expect(client.stderr).toOutput('? WorkOS domain');
    // The server would substitute this into `https://{domain}/…`, where
    // WHATWG parsing reads an all-numeric host as the IPv4 number
    // 0.0.90.83 and the outbound guard rejects it — two prompts later,
    // naming neither the field nor the reason.
    client.stdin.write('23123\n');
    await expect(client.stderr).toOutput(
      'Enter a hostname like api.workos.com, without the https:// prefix.'
    );

    client.stdin.write('api.workos.com\n');
    await expect(client.stderr).toOutput('? Client ID');
    client.stdin.write('id\n');
    await expect(client.stderr).toOutput('? Client Secret');
    client.stdin.write('\n');

    expect(await exitCodePromise).toBe(0);
  });

  it('names the offending --param when it is not a hostname', async () => {
    useConnexServices(client, { workos: workosServiceInfo });
    (client.stdin as any).isTTY = false;

    client.setArgv(
      'connect',
      'create',
      'workos',
      '--name',
      'wo',
      '--connection-method',
      'oauth',
      '--param',
      'domain=23123',
      '--data',
      '{"clientId":"ci"}'
    );

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      'Invalid --param domain="23123". Enter a hostname like api.workos.com, without the https:// prefix.'
    );
  });

  it('leaves opaque template fields unchecked', async () => {
    useConnexServices(client, { okta: oktaServiceInfo });
    (client.stdin as any).isTTY = false;
    const created = mockConnexCreate(client, { id: 'scl_ok', uid: 'okta/ok' });

    client.setArgv(
      'connect',
      'create',
      'okta',
      '--name',
      'ok',
      '--connection-method',
      'custom-server',
      '--param',
      'domain=acme.okta.com',
      // `auth_server_id`'s sample is `default` — not a host, so no check.
      '--param',
      'auth_server_id=ausx1y2z3',
      '--data',
      '{"clientId":"ci"}'
    );

    expect(await connect(client)).toBe(0);
    expect(created.body.params).toEqual({
      domain: 'acme.okta.com',
      auth_server_id: 'ausx1y2z3',
    });
  });

  it('takes the field default when the prompt is accepted as-is', async () => {
    useConnexServices(client, { workos: workosServiceInfo });
    const created = mockConnexCreate(client, {
      id: 'scl_wd',
      uid: 'workos/wd',
    });

    client.setArgv('connect', 'create', 'workos', '--name', 'wd');
    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput('Connect to WorkOS with OAuth 2.0');
    client.stdin.write('\n');

    await expect(client.stderr).toOutput('? WorkOS domain');
    client.stdin.write('\n');
    await expect(client.stderr).toOutput('? Client ID');
    client.stdin.write('id\n');
    await expect(client.stderr).toOutput('? Client Secret');
    client.stdin.write('\n');

    expect(await exitCodePromise).toBe(0);
    expect(created.body.params).toEqual({ domain: 'api.workos.com' });
  });

  it('accepts --param non-interactively and fills defaults', async () => {
    useConnexServices(client, { okta: oktaServiceInfo });
    (client.stdin as any).isTTY = false;
    const created = mockConnexCreate(client, {
      id: 'scl_okta_ni',
      uid: 'okta/ni',
    });

    client.setArgv(
      'connect',
      'create',
      'okta',
      '--name',
      'ni',
      '--connection-method',
      'custom-server',
      '--param',
      'domain=acme.okta.com',
      '--data',
      '{"clientId":"ci","clientSecret":"cs"}'
    );

    expect(await connect(client)).toBe(0);
    expect(created.body.params).toEqual({
      domain: 'acme.okta.com',
      auth_server_id: 'default',
    });
    expect(created.body.data).toEqual({ clientId: 'ci', clientSecret: 'cs' });
  });

  it('errors on an unknown --param key', async () => {
    useConnexServices(client, { okta: oktaServiceInfo });
    (client.stdin as any).isTTY = false;

    client.setArgv(
      'connect',
      'create',
      'okta',
      '--name',
      'x',
      '--connection-method',
      'custom-server',
      '--param',
      'domian=acme.okta.com',
      '--data',
      '{"clientId":"ci"}'
    );

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      'Unknown --param "domian" for connection method "custom-server". Valid keys: domain, auth_server_id.'
    );
  });

  it('errors on a malformed --param', async () => {
    client.setArgv(
      'connect',
      'create',
      'okta',
      '--name',
      'x',
      '--param',
      'domain'
    );

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      'Invalid --param "domain". Use --param KEY=VALUE.'
    );
  });

  it('names the missing --param in non-interactive mode', async () => {
    useConnexServices(client, { okta: oktaServiceInfo });
    (client.stdin as any).isTTY = false;

    client.setArgv(
      'connect',
      'create',
      'okta',
      '--name',
      'x',
      '--connection-method',
      'custom-server',
      '--data',
      '{"clientId":"ci"}'
    );

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      'Missing --param domain=<value> ("Okta domain", e.g. acme.okta.com) for connection method "custom-server".'
    );
  });

  it('chooses between two managed methods and sends the slug', async () => {
    useConnexServices(client, { snowflake: snowflakeServiceInfo });
    const created = mockConnexManagedCreate(client, {
      id: 'scl_snow',
      uid: 'snowflake/warehouse',
    });

    client.setArgv('connect', 'create', 'snowflake', '--name', 'warehouse');
    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput(
      'How do you want to connect to Snowflake?'
    );
    // Move past the recommended first entry to Partner Connect.
    client.events.keypress('down');
    client.events.keypress('enter');

    expect(await exitCodePromise).toBe(0);
    expect(created.body.connectionMethod).toBe('partner-connect');
    expect(created.body.target).toBeUndefined();
  });

  it('routes --connection-method wif straight to managed create', async () => {
    useConnexServices(client, { snowflake: snowflakeServiceInfo });
    (client.stdin as any).isTTY = false;
    const created = mockConnexManagedCreate(client, {
      id: 'scl_wif',
      uid: 'snowflake/wif',
    });

    client.setArgv(
      'connect',
      'create',
      'snowflake',
      '--connection-method',
      'wif',
      '--name',
      'snowflake-wif'
    );

    expect(await connect(client)).toBe(0);
    expect(created.body.connectionMethod).toBe('wif');
  });

  it('keeps the browser fallback intact for a managed method', async () => {
    useConnexServices(client, { slack: slackServiceInfo });
    let postBody: any;
    client.scenario.post('/v1/connect/connectors/managed', (req, res) => {
      postBody = req.body;
      res.statusCode = 422;
      res.json({
        error: {
          message: 'Registration required',
          registerUrl:
            'https://vercel.com/api/v1/connex/clients/managed?teamId=t&service=slack&connectionMethod=slack-app',
        },
      });
    });
    client.scenario.get('/v1/connect/result/:code', (_req, res) => {
      res.json({ status: 'success', data: { clientId: 'scl_slack_app' } });
    });
    client.scenario.get('/v1/connect/connectors/:id', (req, res) => {
      res.json(
        fakeConnexClient({
          id: (req.params as any).id,
          uid: 'slack/my-bot',
          connectionMethod: 'slack-app',
        })
      );
    });
    client.scenario.patch('/v1/connect/connectors/:id', (req, res) => {
      res.json(
        fakeConnexClient({
          id: (req.params as any).id,
          uid: 'slack/my-bot',
          connectionMethod: 'slack-app',
          backgroundColor: '#1A2B3C',
        })
      );
    });

    client.setArgv(
      'connect',
      'create',
      'slack',
      '--name',
      'my-bot',
      '--yes',
      '--background-color',
      '#1A2B3C'
    );

    expect(await connect(client)).toBe(0);
    expect(postBody.connectionMethod).toBe('slack-app');

    const opened = (open as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    const openedUrl = new URL(opened);
    // The server-built registerUrl is preserved; the CLI only appends
    // branding on top of it.
    expect(openedUrl.searchParams.get('connectionMethod')).toBe('slack-app');
    expect(openedUrl.searchParams.get('service')).toBe('slack');
    expect(openedUrl.searchParams.get('backgroundColor')).toBe('#1A2B3C');
    await expect(client.stderr).toOutput(
      'slack connector created via Slack app: scl_slack_app'
    );
  });

  it('forces the manual path when --data joins --connection-method', async () => {
    useConnexServices(client, { slack: slackServiceInfo });
    (client.stdin as any).isTTY = false;
    let managedHit = false;
    let postBody: any;
    client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
      managedHit = true;
      res.json(fakeConnexClient());
    });
    client.scenario.post('/v1/connect/connectors', (req, res) => {
      postBody = req.body;
      res.json(fakeConnexClient({ id: 'scl_slack_byo', uid: 'slack/byo' }));
    });

    client.setArgv(
      'connect',
      'create',
      'slack',
      '--name',
      'byo',
      '--connection-method',
      'slack-app',
      '--data',
      '{"clientId":"ci","clientSecret":"cs","signingSecret":"ss"}'
    );

    expect(await connect(client)).toBe(0);
    expect(managedHit).toBe(false);
    expect(postBody).toMatchObject({
      connectionMethod: 'slack-app',
      data: { clientId: 'ci', clientSecret: 'cs', signingSecret: 'ss' },
    });
    expect(postBody.type).toBeUndefined();
  });

  it('carries service, connectionMethod, and target in --json', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    mockConnexManagedCreate(client, {
      id: 'scl_json_m',
      uid: 'notion/json',
      type: 'oauth',
      service: 'notion',
      connectionMethod: 'mcp',
      target: 'mcp',
    });

    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'json',
      '--connection-method',
      'mcp',
      '--json'
    );

    expect(await connect(client)).toBe(0);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed).toMatchObject({
      id: 'scl_json_m',
      service: 'notion',
      connectionMethod: 'mcp',
      target: 'mcp',
    });
    // JSON stdout stays JSON-only.
    expect(client.stdout.getFullOutput()).not.toContain('connector created');
  });

  it('enumerates valid methods for an unknown --connection-method', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'x',
      '--connection-method',
      'oauth2'
    );

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      'Unknown connection method "oauth2" for "notion". Available: oauth (OAuth 2.0), mcp (MCP), api-key (API key).'
    );
  });

  it('enumerates valid targets for an unknown --target', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'x',
      '--target',
      'rest'
    );

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      'Unknown target "rest". Available: api (Notion API), mcp (Notion MCP).'
    );
  });

  it('rejects a --target the chosen method does not serve', async () => {
    useConnexServices(client, { notion: notionServiceInfo });

    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'x',
      '--connection-method',
      'api-key',
      '--target',
      'mcp'
    );

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      'Connection method "api-key" doesn\'t connect to target "mcp".'
    );
  });

  it('rejects --target for a service with no targets', async () => {
    useConnexServices(client, { npm: npmServiceInfo });

    client.setArgv(
      'connect',
      'create',
      'npm',
      '--name',
      'x',
      '--target',
      'registry'
    );

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      '"npm" doesn\'t publish targets, so --target can\'t be used.'
    );
  });

  it('rejects --connection-method combined with --connector-type', async () => {
    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'x',
      '--connection-method',
      'oauth',
      '--connector-type',
      'oauth',
      '--data',
      '{"clientId":"a"}'
    );

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      'The --connector-type and --connection-method flags cannot be combined.'
    );
  });

  it('names --connection-method when non-interactive and ambiguous', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    (client.stdin as any).isTTY = false;

    client.setArgv('connect', 'create', 'notion', '--name', 'x');

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      'Missing --connection-method. "notion" supports: oauth (OAuth 2.0), mcp (MCP), api-key (API key). Re-run with --connection-method <value>.'
    );
  });

  it('auto-selects an unambiguous method when non-interactive', async () => {
    useConnexServices(client, { snowflake: snowflakeServiceInfo });
    (client.stdin as any).isTTY = false;
    const created = mockConnexManagedCreate(client, {
      id: 'scl_auto',
      uid: 'snowflake/auto',
    });

    client.setArgv(
      'connect',
      'create',
      'snowflake',
      '--name',
      'auto',
      '--connection-method',
      'partner-connect'
    );

    expect(await connect(client)).toBe(0);
    expect(created.body.connectionMethod).toBe('partner-connect');
  });

  it('names the credential fields when non-interactive and --data is absent', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    (client.stdin as any).isTTY = false;

    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'x',
      '--connection-method',
      'oauth'
    );

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      'Missing credentials. Provide --data with: clientId (required), clientSecret. Pass --data @<path> to read from a file.'
    );
  });

  it('names the api-key shape when non-interactive and --data is absent', async () => {
    useConnexServices(client, { npm: npmServiceInfo });
    (client.stdin as any).isTTY = false;

    client.setArgv(
      'connect',
      'create',
      'npm',
      '--name',
      'x',
      '--connection-method',
      'access-token'
    );

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      'Missing credentials. Provide --data with: values: [{ "value": "<api key>" }]. Pass --data @<path> to read from a file.'
    );
  });

  it('never prompts when client.nonInteractive is set', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    client.nonInteractive = true;

    client.setArgv('connect', 'create', 'notion', '--name', 'x');

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput('Missing --connection-method.');
  });

  it('falls through to managed create when service-info 404s', async () => {
    useConnexServices(client, {});
    const created = mockConnexManagedCreate(client, {
      id: 'scl_ft404',
      uid: 'uid_ft404',
    });

    client.setArgv('connect', 'create', 'jira', '--name', 'my-jira');

    expect(await connect(client)).toBe(0);
    expect(created.body).toMatchObject({
      service: 'jira',
      name: 'my-jira',
      triggers: { enabled: false },
    });
    expect(created.body.connectionMethod).toBeUndefined();
    expect(created.body.target).toBeUndefined();
    await expect(client.stderr).toOutput(
      'jira connector created: scl_ft404 (UID uid_ft404)'
    );
  });

  it('falls through when the service publishes no connection methods', async () => {
    useConnexServices(client, { github: githubServiceInfo });
    const created = mockConnexManagedCreate(client, {
      id: 'scl_ftgh',
      uid: 'uid_ftgh',
    });

    client.setArgv('connect', 'create', 'github', '--name', 'my-gh');

    expect(await connect(client)).toBe(0);
    expect(created.body.connectionMethod).toBeUndefined();
    await expect(client.stderr).toOutput('github connector created:');
    expect(client.stderr.getFullOutput()).not.toContain('via ');
  });

  it('falls through when loading connection methods fails', async () => {
    client.scenario.get('/v1/connect/services/:service', (_req, res) => {
      res.statusCode = 500;
      res.json({ error: { code: 'internal', message: 'boom' } });
    });
    const created = mockConnexManagedCreate(client, {
      id: 'scl_ft500',
      uid: 'uid_ft500',
    });

    client.setArgv('connect', 'create', 'slack', '--name', 'my-bot');

    expect(await connect(client)).toBe(0);
    expect(created.body.connectionMethod).toBeUndefined();
  });

  it('surfaces the failure when --connection-method needs service info', async () => {
    client.scenario.get('/v1/connect/services/:service', (_req, res) => {
      res.statusCode = 500;
      res.json({ error: { code: 'internal', message: 'boom' } });
    });

    client.setArgv(
      'connect',
      'create',
      'slack',
      '--name',
      'my-bot',
      '--connection-method',
      'slack-app'
    );

    expect(await connect(client)).toBe(1);
  });

  it.each([
    ['--connection-method', ['--connection-method', 'github-app']],
    ['--target', ['--target', 'repos']],
    ['--param', ['--param', 'org=acme']],
  ])('rejects %s for a service with no methods rather than dropping it', async (flag, argv) => {
    useConnexServices(client, { github: githubServiceInfo });
    let managedHit = false;
    client.scenario.post('/v1/connect/connectors/managed', (_req, res) => {
      managedHit = true;
      res.json(fakeConnexClient());
    });

    client.setArgv('connect', 'create', 'github', '--name', 'x', ...argv);

    expect(await connect(client)).toBe(1);
    // The flag has no meaning without published methods, so it must not
    // slip through into the managed create as a silently ignored value.
    expect(managedHit).toBe(false);
    await expect(client.stderr).toOutput(
      `"github" doesn't publish connection methods, so ${flag} can't be used.`
    );
  });

  it('rejects --connection-method for a service with no methods', async () => {
    useConnexServices(client, { github: githubServiceInfo });

    client.setArgv(
      'connect',
      'create',
      'github',
      '--name',
      'x',
      '--connection-method',
      'github-app'
    );

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      '"github" doesn\'t publish connection methods, so --connection-method can\'t be used.'
    );
  });

  it('leaves the legacy --data path free of connection-method prompts', async () => {
    const { requests } = useConnexServices(client, {
      notion: notionServiceInfo,
    });
    const created = mockConnexCreate(client, {
      id: 'scl_legacy',
      uid: 'uid_legacy',
    });

    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'legacy',
      '--data',
      '{"clientId":"abc123"}'
    );

    expect(await connect(client)).toBe(0);
    // One fetch, and only the legacy type-discovery one.
    expect(requests).toHaveLength(1);
    expect(created.body).toMatchObject({
      service: 'notion',
      type: 'oauth',
      data: { clientId: 'abc123' },
    });
    expect(created.body.connectionMethod).toBeUndefined();
    const stderr = client.stderr.getFullOutput();
    expect(stderr).not.toContain('How do you want to connect');
    expect(stderr).not.toContain('What do you want to connect to');
    expect(stderr).toContain('notion connector created: scl_legacy');
  });

  it('rejects --param and --target on the legacy --data path', async () => {
    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'x',
      '--data',
      '{"clientId":"a"}',
      '--param',
      'domain=acme.okta.com'
    );

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      'The --param flag requires --connection-method.'
    );

    client.reset();
    useUser();
    team = useTeam();
    client.config.currentTeam = team.id;
    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'x',
      '--data',
      '{"clientId":"a"}',
      '--target',
      'api'
    );

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      'The --target flag requires --connection-method.'
    );
  });

  it('rejects --param for a managed method that takes none', async () => {
    useConnexServices(client, { snowflake: snowflakeServiceInfo });
    (client.stdin as any).isTTY = false;

    client.setArgv(
      'connect',
      'create',
      'snowflake',
      '--name',
      'x',
      '--connection-method',
      'wif',
      '--param',
      'domain=acme'
    );

    expect(await connect(client)).toBe(1);
    await expect(client.stderr).toOutput(
      'Connection method "wif" is registered automatically and takes no --param values.'
    );
  });

  it('prints every option in full above the chooser', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    mockConnexCreate(client, { id: 'scl_rich', uid: 'notion/rich' });

    client.setArgv('connect', 'create', 'notion', '--name', 'rich');
    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput('What do you want to connect to?');
    // Every option carries its own description and docs link, not just the
    // highlighted one. They are printed above the prompt rather than baked
    // into the choice names — see printOptionCatalog.
    const printed = client.stderr.getFullOutput();
    expect(printed).toContain('Notion products:');
    expect(printed).toContain(
      "Connect your application directly to Notion's API"
    );
    expect(printed).toContain(
      'Docs: https://developers.notion.com/reference/intro'
    );
    expect(printed).toContain('Connect AI agents and assistants');
    expect(printed).toContain('Docs: https://developers.notion.com/docs/mcp');
    client.stdin.write('\n');

    await expect(client.stderr).toOutput(
      'How do you want to connect to Notion?'
    );
    const methodCatalog = client.stderr.getFullOutput();
    expect(methodCatalog).toContain('Connection methods for Notion:');
    expect(methodCatalog).toContain('OAuth 2.0 — bring your own credentials');
    // The chooser itself stays one line per option.
    expect(client.getScreen()).toContain('OAuth 2.0');
    expect(client.getScreen()).not.toContain('(recommended)');
    client.stdin.write('\n');

    await expect(client.stderr).toOutput('? Client ID');
    client.stdin.write('id\n');
    await expect(client.stderr).toOutput('? Client Secret');
    client.stdin.write('\n');

    expect(await exitCodePromise).toBe(0);
  });

  it('keeps every option listed after moving the cursor', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    mockConnexManagedCreate(client, { id: 'scl_move', uid: 'notion/move' });

    client.setArgv('connect', 'create', 'notion', '--name', 'move');
    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput('What do you want to connect to?');
    client.events.keypress('down');
    await new Promise(resolve => setTimeout(resolve, 100));

    // Multi-line choice names made the renderer drop the entry above the
    // selected one, because pagination positions items by index but lays
    // them out by line. Both must stay visible.
    const screen = client.getScreen();
    expect(screen).toContain('Notion API');
    expect(screen).toContain('Notion MCP');
    // The cursor is `figures.pointer`: `>` on Windows, `❯` elsewhere.
    expect(screen).toMatch(/[❯>] Notion MCP/);

    client.events.keypress('enter');
    await expect(client.stderr).toOutput('Connect to Notion with MCP');
    client.stdin.write('\n');

    expect(await exitCodePromise).toBe(0);
  });

  it('leaves the method order to speak for itself', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    mockConnexCreate(client, { id: 'scl_rec', uid: 'notion/rec' });

    // Filtering to the `api` target leaves oauth + api-key. oauth is the
    // service's first method, so it keeps the badge and api-key gets none.
    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'rec',
      '--target',
      'api'
    );
    const exitCodePromise = connect(client);

    await expect(client.stderr).toOutput(
      'How do you want to connect to Notion?'
    );
    const screen = client.getScreen();
    expect(screen).toContain('OAuth 2.0');
    expect(screen).toContain('API key');
    // Order is precedence; no badge claims it.
    expect(screen).not.toContain('(recommended)');
    client.stdin.write('\n');

    await expect(client.stderr).toOutput('? Client ID');
    client.stdin.write('id\n');
    await expect(client.stderr).toOutput('? Client Secret');
    client.stdin.write('\n');

    expect(await exitCodePromise).toBe(0);
  });

  it('tracks the new create options in telemetry', async () => {
    useConnexServices(client, { notion: notionServiceInfo });
    mockConnexManagedCreate(client, { id: 'scl_tel', uid: 'notion/tel' });

    client.setArgv(
      'connect',
      'create',
      'notion',
      '--name',
      'tel',
      '--connection-method',
      'mcp',
      '--target',
      'mcp',
      '--yes'
    );

    expect(await connect(client)).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:create', value: 'create' },
      { key: 'argument:service', value: 'notion' },
      { key: 'option:name', value: '[REDACTED]' },
      { key: 'option:connection-method', value: 'mcp' },
      { key: 'option:target', value: 'mcp' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });
});
