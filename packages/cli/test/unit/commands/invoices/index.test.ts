import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';
import invoices from '../../../../src/commands/invoices';

const invoice = {
  id: 'in_123',
  invoiceNumber: 'ABC-0001',
  status: 'paid',
  currency: 'usd',
  subtotal: '20.00',
  total: '20.00',
  amountDue: '20.00',
  createdAt: '2026-09-01T00:00:00.000Z',
  issuedAt: '2026-09-01T00:00:00.000Z',
  dueDate: null,
  hostedUrl: 'https://invoice.example.com/in_123',
  lineItems: [
    { description: 'Pro plan', amount: '20.00' },
    { description: 'Free item', amount: '0.00' },
  ],
};

describe('invoices', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints help', async () => {
    client.setArgv('invoices', '--help');
    expect(await invoices(client)).toEqual(2);
    expect(client.getFullOutput()).toContain('upcoming');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'invoices' },
    ]);
  });

  it.each([
    { args: ['help', 'invoices', '-h'], telemetryValue: 'invoices' },
    { args: ['help', 'invoice', 'ls', '-h'], telemetryValue: 'invoices:ls' },
    {
      args: ['help', 'invoices', 'upcoming', '-h'],
      telemetryValue: 'invoices:upcoming',
    },
  ])('supports root help: $args', async ({ args, telemetryValue }) => {
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv(...args);

    expect(await invoices(client)).toEqual(2);
    expect(client.getFullOutput()).toContain('vercel invoices');
    expect(client.getFullOutput()).not.toContain('Unexpected arguments');
    expect(fetch).not.toHaveBeenCalled();
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: telemetryValue },
    ]);
  });

  it.each([
    '0',
    '-1',
    '51',
    '1.5',
    'NaN',
    'Infinity',
  ])('rejects invalid --limit %s before requesting invoices', async limit => {
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv('invoices', 'ls', '--limit', limit, '--json');

    expect(await invoices(client)).toEqual(1);
    expect(client.getFullOutput()).toContain(
      'Use an integer from 1 to 50 for --limit.'
    );
    expect(client.stdout.getFullOutput()).toBe('');
    expect(fetch).not.toHaveBeenCalled();
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:list', value: 'ls' },
    ]);
  });

  it('rejects invalid statuses without logging them or sending them to telemetry', async () => {
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv('invoices', 'ls', '--status', 'private-value', '--json');

    expect(await invoices(client)).toEqual(1);
    expect(client.getFullOutput()).toContain(
      'Use one of these values for --status:'
    );
    expect(client.getFullOutput()).not.toContain('private-value');
    expect(client.stdout.getFullOutput()).toBe('');
    expect(fetch).not.toHaveBeenCalled();
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:list', value: 'ls' },
    ]);
  });

  it.each([
    'ls',
    'upcoming',
  ])('handles account lookup failures for %s', async subcommand => {
    vi.spyOn(client, 'fetch').mockRejectedValueOnce(
      new Error('Failed to resolve account')
    );
    client.setArgv('invoices', subcommand, '--json');

    expect(await invoices(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Failed to resolve account'
    );
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('documents --details in list help', async () => {
    client.setArgv('invoices', 'ls', '--help');
    expect(await invoices(client)).toEqual(2);
    const out = client.stderr.getFullOutput();
    expect(out).toContain('--details');
    expect(out).toContain('Show individual line items for each invoice');
    expect(out).toContain('invoices ls --details');
    expect(out.replace(/[ \t]+$/gm, '')).toMatchInlineSnapshot(`
      "
        ▲ vercel invoices list [options]

        List invoices

        Options:

             --details          Show individual line items for each invoice
        -F,  --format <FORMAT>  Specify the output format (json)
             --json             Output as JSON
             --limit <NUMBER>   Number of invoices to return (default: 10, max: 50)
        -N,  --next <CURSOR>    Show next page of results
             --status <STATUS>  Filter by status: draft, open, paid, uncollectible,
                                void (can be used multiple times)


        Global Options:

             --cwd <DIR>            Sets the current working directory for a single
                                    run of a command
        -d,  --debug                Debug mode (default off)
        -Q,  --global-config <DIR>  Path to the global \`.vercel\` directory
        -h,  --help                 Output usage information
        -A,  --local-config <FILE>  Path to the local \`vercel.json\` file
             --no-color             No color mode (default off)
             --non-interactive      Run without interactive prompts; when an agent is
                                    detected this is the default
        -S,  --scope                Set a custom scope
        -t,  --token <TOKEN>        Login token
        -v,  --version              Output the version number


        Examples:

        - List invoices

          $ vercel invoices ls

        - List invoices with line items

          $ vercel invoices ls --details

        - List open invoices as JSON

          $ vercel invoices ls --status open --json

      "
    `);
  });

  it.each([
    ['upcomming', '--json'],
    ['--json', 'upcomming'],
    ['ls', 'unexpected', '--json'],
    ['upcoming', 'unexpected', '--json'],
  ])('rejects unexpected positionals: %j', async (...args) => {
    const fetch = vi.spyOn(client, 'fetch');
    client.setArgv('invoices', ...args);

    expect(await invoices(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('✗ Unexpected arguments.');
    expect(client.stderr.getFullOutput()).toContain('invoices --help');
    expect(client.stdout.getFullOutput()).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  describe('with team context', () => {
    beforeEach(() => {
      useUser();
      useTeams('team_dummy');
      client.config.currentTeam = 'team_dummy';
    });

    it.each([
      'ls',
      'upcoming',
    ])('reports permission errors for %s without writing to JSON stdout', async subcommand => {
      const endpoint =
        subcommand === 'ls' ? '/v2/invoices' : '/v1/invoices/upcoming';
      client.scenario.get(endpoint, (_req, res) => {
        res.status(403).json({
          error: {
            code: 'forbidden',
            message: 'Not authorized to read invoices.',
          },
        });
      });

      client.setArgv('invoices', subcommand, '--json');
      expect(await invoices(client)).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Not authorized to read invoices.'
      );
      expect(client.stdout.getFullOutput()).toBe('');
    });

    it.each([1, 50])('accepts the page-size boundary %s', async limit => {
      let query: Record<string, unknown> = {};
      client.scenario.get('/v2/invoices', (req, res) => {
        query = req.query;
        res.json({ data: [], hasMore: false, nextCursor: null });
      });

      client.setArgv('invoices', '--limit', String(limit), '--json');
      expect(await invoices(client)).toEqual(0);
      expect(query).toMatchObject({
        limit: String(limit),
        teamId: 'team_dummy',
      });
    });

    it.each([
      ['--token', 'test-secret'],
      ['--token=test-secret'],
      ['-t', 'test-secret'],
    ])('preserves encoded cursors and omits authentication flags: %j', async (...authFlags) => {
      let query: Record<string, unknown> = {};
      client.scenario.get('/v2/invoices', (req, res) => {
        query = req.query;
        res.json({ data: [invoice], hasMore: true, nextCursor: 'next+/==' });
      });

      client.setArgv('invoices', 'ls', '--next', 'cursor+/==', ...authFlags);
      expect(await invoices(client)).toEqual(0);
      expect(query).toMatchObject({
        cursor: 'cursor+/==',
        teamId: 'team_dummy',
      });
      expect(client.getFullOutput()).toContain("invoices ls --next 'next+/=='");
      expect(client.getFullOutput()).not.toContain('test-secret');
      expect(client.getFullOutput()).not.toContain('--token');
      expect(client.getFullOutput()).not.toContain('-t');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:list', value: 'ls' },
        { key: 'option:next', value: '[REDACTED]' },
      ]);
    });

    it('lists invoices with filters and a next-page hint', async () => {
      let query: Record<string, unknown> = {};
      client.scenario.get('/v2/invoices', (req, res) => {
        query = req.query;
        res.json({ data: [invoice], hasMore: true, nextCursor: 'cur_1' });
      });

      client.setArgv('invoices', 'ls', '--status', 'paid', '--limit', '5');
      expect(await invoices(client)).toEqual(0);

      expect(query).toMatchObject({
        teamId: 'team_dummy',
        statuses: 'paid',
        limit: '5',
      });
      const out = client.getFullOutput();
      expect(out).toContain('ABC-0001');
      expect(out).toContain('$20.00');
      expect(out).not.toContain('Pro plan');
      expect(out).not.toContain('Free item');
      expect(out).not.toContain('--details');
      expect(out).toContain('invoices ls --next cur_1 --status paid --limit 5');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:list', value: 'ls' },
        { key: 'option:status', value: 'paid' },
        { key: 'option:limit', value: '5' },
      ]);
    });

    it.each([
      true,
      false,
    ])('shows line items grouped by invoice with --details (TTY: %s)', async isTTY => {
      client.stdin.isTTY = isTTY;
      client.stdout.isTTY = isTTY;
      client.stderr.isTTY = isTTY;
      const secondInvoice = {
        ...invoice,
        id: 'in_456',
        invoiceNumber: 'ABC-0002',
        currency: 'eur',
        lineItems: [{ description: 'Usage credit', amount: '-5.00' }],
      };
      let requests = 0;
      client.scenario.get('/v2/invoices', (_req, res) => {
        requests++;
        res.json({
          data: [invoice, secondInvoice],
          hasMore: true,
          nextCursor: 'cur_1',
        });
      });

      client.setArgv('invoices', '--details', 'ls');
      expect(await invoices(client)).toEqual(0);
      const out = client.getFullOutput();
      expect(out).toMatch(/Invoice ABC-0001\n\s+Item\s+Amount/);
      expect(out).toMatch(/Pro plan\s+\$20\.00/);
      expect(out).toMatch(/Free item\s+\$0\.00/);
      expect(out).toMatch(/Invoice ABC-0002\n\s+Item\s+Amount/);
      expect(out).toMatch(/Usage credit\s+-€5\.00/);
      expect(out.indexOf('Invoice ABC-0001')).toBeLessThan(
        out.indexOf('Pro plan')
      );
      expect(out.indexOf('Free item')).toBeLessThan(
        out.indexOf('Invoice ABC-0002')
      );
      expect(out.indexOf('Invoice ABC-0002')).toBeLessThan(
        out.indexOf('Usage credit')
      );
      expect(out).toContain(invoice.hostedUrl);
      expect(out).toContain('invoices ls --next cur_1 --details');
      expect(requests).toBe(1);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:list', value: 'ls' },
        { key: 'flag:details', value: 'TRUE' },
      ]);
    });

    it('handles invoices without line items and uses the ID when there is no number', async () => {
      client.scenario.get('/v2/invoices', (_req, res) => {
        res.json({
          data: [{ ...invoice, invoiceNumber: null, lineItems: [] }],
          hasMore: false,
          nextCursor: null,
        });
      });

      client.setArgv('invoices', '--details');
      expect(await invoices(client)).toEqual(0);
      expect(client.getFullOutput()).toContain(
        'Invoice in_123\n  No line items found.'
      );
    });

    it('handles an empty invoice list with --details', async () => {
      client.scenario.get('/v2/invoices', (_req, res) => {
        res.json({ data: [], hasMore: false, nextCursor: null });
      });

      client.setArgv('invoices', 'ls', '--details');
      expect(await invoices(client)).toEqual(0);
      expect(client.getFullOutput()).toContain('No invoices found.');
      expect(client.getFullOutput()).not.toContain('No line items found.');
    });

    it.each([
      ['--json'],
      ['--format', 'json'],
    ])('keeps JSON output unchanged with --details and %j', async (...formatFlags) => {
      const response = {
        data: [invoice],
        hasMore: true,
        nextCursor: 'cur_1',
      };
      client.scenario.get('/v2/invoices', (_req, res) => {
        res.json(response);
      });

      client.setArgv('invoices', 'ls', '--details', ...formatFlags);
      expect(await invoices(client)).toEqual(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual(response);
      expect(client.stderr.getFullOutput()).toBe('');
    });

    it.each([
      '--scope',
      '-S',
      '--team',
      '-T',
    ])('preserves filters and safe context flags including %s in pagination', async teamFlag => {
      client.scenario.get('/v2/invoices', (_req, res) => {
        res.json({ data: [invoice], hasMore: true, nextCursor: 'cur_2' });
      });
      client.setArgv(
        teamFlag,
        'acme',
        'invoices',
        '--status',
        'paid',
        '--status',
        'open',
        '--limit',
        '5',
        '--details',
        '-N',
        'cur_1',
        '--cwd',
        '/tmp/invoice project',
        '--global-config',
        '/tmp/custom config',
        '--non-interactive',
        '--token',
        'test-secret'
      );

      expect(await invoices(client)).toEqual(0);
      const out = client.getFullOutput();
      expect(out).toContain(
        `invoices ls --next cur_2 --status paid --status open --limit 5 --details ${teamFlag} acme --cwd '/tmp/invoice project' --global-config '/tmp/custom config' --non-interactive`
      );
      expect(out).not.toContain('cur_1');
      expect(out).not.toContain('--token');
      expect(out).not.toContain('test-secret');
    });

    it('defaults to ls and outputs JSON', async () => {
      client.scenario.get('/v2/invoices', (_req, res) => {
        res.json({ data: [], hasMore: false, nextCursor: null });
      });

      client.setArgv('invoices', '--json');
      expect(await invoices(client)).toEqual(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
        data: [],
        hasMore: false,
        nextCursor: null,
      });
    });

    it('shows the upcoming invoice without zero-amount items', async () => {
      client.scenario.get('/v1/invoices/upcoming', (_req, res) => {
        res.json({ data: [invoice] });
      });

      client.setArgv('invoices', 'upcoming');
      expect(await invoices(client)).toEqual(0);
      const out = client.getFullOutput();
      expect(out).toContain('Pro plan');
      expect(out).not.toContain('Free item');
      expect(out).toContain('$20.00');
      expect(out).toMatch(/Invoice Date\s+2026-09-01/);
      expect(out).not.toContain('Billing period ends:');
      expect(out).toMatch(/\n {2}Subtotal\s+\$20\.00\n {2}Total\s+\$20\.00/);
      expect(out).not.toContain('Subtotal:');
    });

    it.each([
      ['--json'],
      ['--format', 'json'],
      ['-F', 'json'],
    ])('routes to upcoming with preceding format flags: %j', async (...flags) => {
      client.scenario.get('/v1/invoices/upcoming', (_req, res) => {
        res.json({ data: [invoice] });
      });

      client.setArgv('invoices', ...flags, 'upcoming');
      expect(await invoices(client)).toEqual(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual(invoice);
      expect(client.stderr.getFullOutput()).toBe('');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:upcoming', value: 'upcoming' },
        flags[0] === '--json'
          ? { key: 'flag:json', value: 'TRUE' }
          : { key: 'option:format', value: 'json' },
      ]);
    });

    it.each([
      'list',
      'ls',
    ])('routes to %s with preceding list options', async subcommand => {
      let query: Record<string, unknown> = {};
      client.scenario.get('/v2/invoices', (req, res) => {
        query = req.query;
        res.json({ data: [invoice], hasMore: false, nextCursor: null });
      });

      client.setArgv(
        'invoice',
        '--status',
        'paid',
        '--limit',
        '5',
        '--json',
        subcommand
      );
      expect(await invoices(client)).toEqual(0);
      expect(query).toMatchObject({ statuses: 'paid', limit: '5' });
      expect(JSON.parse(client.stdout.getFullOutput()).data).toEqual([invoice]);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:list', value: subcommand },
        { key: 'option:status', value: 'paid' },
        { key: 'option:limit', value: '5' },
        { key: 'flag:json', value: 'TRUE' },
      ]);
    });

    it('rejects list-only options for upcoming', async () => {
      const fetch = vi.spyOn(client, 'fetch');
      client.setArgv('invoices', '--status', 'paid', 'upcoming');

      expect(await invoices(client)).toEqual(1);
      expect(client.getFullOutput()).toContain(
        'unknown or unexpected option: --status'
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it('outputs {} as JSON when there is no upcoming invoice', async () => {
      client.scenario.get('/v1/invoices/upcoming', (_req, res) => {
        res.json({ data: [] });
      });

      client.setArgv('invoices', 'upcoming', '--json');
      expect(await invoices(client)).toEqual(0);
      expect(JSON.parse(client.stdout.getFullOutput())).toEqual({});
    });
  });

  it('rejects upcoming for personal accounts', async () => {
    useUser();
    client.setArgv('invoices', 'upcoming');
    expect(await invoices(client)).toEqual(1);
    expect(client.getFullOutput()).toContain('only available for teams');
  });

  it('lists personal invoices without adding a team ID', async () => {
    useUser();
    let query: Record<string, unknown> = {};
    client.scenario.get('/v2/invoices', (req, res) => {
      query = req.query;
      res.json({ data: [invoice], hasMore: false, nextCursor: null });
    });

    client.setArgv('invoices', '--json');
    expect(await invoices(client)).toEqual(0);
    expect(query).not.toHaveProperty('teamId');
    expect(JSON.parse(client.stdout.getFullOutput()).data).toEqual([invoice]);
  });
});
