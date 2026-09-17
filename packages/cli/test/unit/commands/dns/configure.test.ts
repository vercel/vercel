import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import dns from '../../../../src/commands/dns';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import { parseResendRecords } from '../../../../src/util/dns/resend-records';

const response = {
  id: 'resend-domain-test',
  name: 'example.com',
  status: 'not_started',
  records: [
    {
      record: 'SPF',
      name: 'send',
      type: 'MX',
      value: 'feedback-smtp.us-east-1.amazonses.com',
      priority: 10,
      ttl: 'Auto',
    },
    {
      record: 'SPF',
      name: 'send',
      type: 'TXT',
      value: '"v=spf1 include:amazonses.com ~all"',
      ttl: 'Auto',
    },
    {
      record: 'DKIM',
      name: 'resend._domainkey',
      type: 'TXT',
      value: 'p=synthetic-public-key',
      ttl: 'Auto',
    },
  ],
};

describe('dns configure', () => {
  let directory: string;
  let file: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'dns-configure-test-'));
    file = join(directory, 'resend.json');
    writeFileSync(file, JSON.stringify(response));
    useUser();
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    client.nonInteractive = false;
    client.stdin.isTTY = true;
    vi.restoreAllMocks();
  });
  function args(...flags: string[]) {
    client.setArgv(
      'dns',
      'configure',
      'example.com',
      '--resend',
      file,
      ...flags
    );
  }
  function emptyRecords() {
    client.scenario.get('/v5/domains/example.com/records', (_req, res) =>
      res.json({ records: [], pagination: { next: null } })
    );
  }
  function payload() {
    return JSON.parse(client.stdout.getFullOutput());
  }

  it('documents the handoff, confirmation, dry-run and JSON flags', async () => {
    client.setArgv('dns', 'configure', '--help');
    expect(await dns(client)).toBe(2);
    expect(client.stderr.getFullOutput()).toContain('--resend');
    expect(client.stderr.getFullOutput()).toContain('--dry-run');
    expect(client.stderr.getFullOutput()).toContain('resend domains get');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:help', value: 'dns:configure' },
    ]);
  });
  it('adds the exact records in the selected team and emits clean JSON', async () => {
    const team = useTeam('team_dns_setup');
    client.config.currentTeam = team.id;
    const sent: unknown[] = [];
    client.scenario.get('/v5/domains/example.com/records', (req, res) => {
      expect(req.query.teamId).toBe(team.id);
      res.json({ records: [], pagination: { next: null } });
    });
    client.scenario.post('/v2/domains/example.com/records', (req, res) => {
      expect(req.query.teamId).toBe(team.id);
      sent.push(req.body);
      res.json({ uid: `record-${sent.length}` });
    });
    args('--yes', '--json');
    expect(await dns(client)).toBe(0);
    expect(sent).toEqual(parseResendRecords('example.com', response).records);
    expect(payload()).toMatchObject({
      status: 'success',
      team: team.slug,
      verification: 'not_checked',
      created: [{ id: 'record-1' }, { id: 'record-2' }, { id: 'record-3' }],
    });
    expect(client.stderr.getFullOutput()).not.toContain('Configured');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:configure', value: 'configure' },
      { key: 'argument:domain', value: '[REDACTED]' },
      { key: 'option:resend', value: '[REDACTED]' },
      { key: 'flag:yes', value: 'TRUE' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });
  it('reads every page before creating records and skips an exact match on a later page', async () => {
    const calls: string[] = [];
    client.scenario.get('/v5/domains/example.com/records', (req, res) => {
      calls.push(`GET:${req.query.until || 'first'}`);
      expect(req.query.limit).toBe('100');
      res.json(
        req.query.until
          ? {
              records: [
                {
                  id: 'mx-present',
                  ...parseResendRecords('example.com', response).records[0],
                },
              ],
              pagination: { next: null },
            }
          : {
              records: [
                { id: 'website', name: '', type: 'A', value: '192.0.2.1' },
              ],
              pagination: { next: 123 },
            }
      );
    });
    client.scenario.post('/v2/domains/example.com/records', (req, res) => {
      calls.push(`POST:${req.body.type}`);
      res.json({ uid: `record-${calls.length}` });
    });
    args('--yes', '--json');
    expect(await dns(client)).toBe(0);
    expect(calls).toEqual(['GET:first', 'GET:123', 'POST:TXT', 'POST:TXT']);
    expect(payload().skipped).toEqual([
      { id: 'mx-present', name: 'send', type: 'MX' },
    ]);
  });
  it('fails all preflight before any writes when a later page has a conflict', async () => {
    client.scenario.get('/v5/domains/example.com/records', (req, res) =>
      res.json(
        req.query.until
          ? {
              records: [
                {
                  id: 'existing-mail',
                  name: 'send',
                  type: 'MX',
                  value: 'mail.other.test',
                  mxPriority: 10,
                },
              ],
              pagination: { next: null },
            }
          : { records: [], pagination: { next: 123 } }
      )
    );
    const fetch = vi.spyOn(client, 'fetch');
    args('--yes', '--json');
    expect(await dns(client)).toBe(1);
    expect(payload().message).toContain('conflict');
    expect(
      fetch.mock.calls.some(([, options]) => options?.method === 'POST')
    ).toBe(false);
  });
  it.each([
    'missing',
    'repeated',
    'invalid',
  ])('fails closed on %s pagination', async kind => {
    client.scenario.get('/v5/domains/example.com/records', (_req, res) =>
      res.json({
        records: [],
        ...(kind === 'missing'
          ? {}
          : { pagination: { next: kind === 'invalid' ? 'invalid' : 123 } }),
      })
    );
    const fetch = vi.spyOn(client, 'fetch');
    args('--yes', '--json');
    expect(await dns(client)).toBe(1);
    expect(payload().created).toEqual([]);
    expect(
      fetch.mock.calls.some(([, options]) => options?.method === 'POST')
    ).toBe(false);
  });
  it('dry-run remains read-only even with --yes', async () => {
    emptyRecords();
    const fetch = vi.spyOn(client, 'fetch');
    const prompt = vi.spyOn(client.input, 'confirm');
    args('--dry-run', '--yes', '--json');
    expect(await dns(client)).toBe(0);
    expect(payload()).toMatchObject({
      status: 'dry_run',
      missing: [{ type: 'MX' }, { type: 'TXT' }, { type: 'TXT' }],
    });
    expect(
      fetch.mock.calls.some(
        ([, options]) => options?.method && options.method !== 'GET'
      )
    ).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
  });
  it.each([
    'non-interactive',
    'pipe',
    'json',
  ])('requires --yes without prompting in %s mode', async mode => {
    emptyRecords();
    if (mode === 'non-interactive') client.nonInteractive = true;
    if (mode === 'pipe') client.stdin.isTTY = false;
    const prompt = vi.spyOn(client.input, 'confirm');
    const fetch = vi.spyOn(client, 'fetch');
    args(...(mode === 'json' ? ['--json'] : []));
    expect(await dns(client)).toBe(1);
    expect(prompt).not.toHaveBeenCalled();
    expect(
      fetch.mock.calls.some(([, options]) => options?.method === 'POST')
    ).toBe(false);
    if (mode !== 'pipe') expect(payload().status).toBe('action_required');
  });
  it('shows a resolved team and record preview before the interactive confirmation', async () => {
    emptyRecords();
    const confirm = vi
      .spyOn(client.input, 'confirm')
      .mockImplementation(async () => {
        expect(client.stderr.getFullOutput()).toMatch(/Team\s+.+/);
        expect(client.stderr.getFullOutput()).toContain(
          'send MX 10 feedback-smtp'
        );
        return false;
      });
    const fetch = vi.spyOn(client, 'fetch');
    args();
    expect(await dns(client)).toBe(0);
    expect(confirm).toHaveBeenCalledWith('Add the missing DNS records?', false);
    expect(client.stderr.getFullOutput()).toContain(
      'Canceled. No DNS records changed.'
    );
    expect(
      fetch.mock.calls.some(([, options]) => options?.method === 'POST')
    ).toBe(false);
  });
  it('reports an already-configured domain without confirmation or mutations', async () => {
    client.scenario.get('/v5/domains/example.com/records', (_req, res) =>
      res.json({
        records: parseResendRecords('example.com', response).records.map(
          (record, i) => ({ ...record, id: `record-${i}` })
        ),
        pagination: { next: null },
      })
    );
    args('--json');
    expect(await dns(client)).toBe(0);
    expect(payload()).toMatchObject({
      status: 'success',
      created: [],
      message: 'All requested Resend DNS records are already present.',
    });
  });
  it.each([
    403, 409, 429, 500,
  ])('stops after HTTP %s, keeps confirmed additions and never retries', async status => {
    emptyRecords();
    const sent: unknown[] = [];
    client.scenario.post('/v2/domains/example.com/records', (req, res) => {
      sent.push(req.body);
      if (sent.length === 1) res.json({ uid: 'completed-mx' });
      else
        res.status(status).json({
          error: {
            code: 'test-error',
            message: 'Do not echo this response body',
          },
        });
    });
    args('--yes', '--json');
    expect(await dns(client)).toBe(1);
    expect(sent).toHaveLength(2);
    expect(payload()).toMatchObject({
      status: 'error',
      created: [{ id: 'completed-mx' }],
      attemptedRecord: { type: 'TXT', name: 'send' },
    });
    expect(payload().message).toContain(`HTTP ${status}`);
    expect(client.stdout.getFullOutput()).not.toContain('Do not echo');
    expect(payload().next[0].command).toContain('dns ls example.com');
  });
  it('does not retry an ambiguous malformed success response', async () => {
    emptyRecords();
    let calls = 0;
    client.scenario.post('/v2/domains/example.com/records', (_req, res) => {
      calls++;
      res.json({});
    });
    args('--yes', '--json');
    expect(await dns(client)).toBe(1);
    expect(calls).toBe(1);
    expect(payload().attemptedRecord.type).toBe('MX');
  });
  it('reruns skip a previously completed record and add only remaining records', async () => {
    const existing = [
      {
        ...parseResendRecords('example.com', response).records[0],
        id: 'completed-mx',
      },
    ];
    client.scenario.get('/v5/domains/example.com/records', (_req, res) =>
      res.json({ records: existing, pagination: { next: null } })
    );
    const sent: string[] = [];
    client.scenario.post('/v2/domains/example.com/records', (req, res) => {
      sent.push(req.body.type);
      res.json({ uid: `record-${sent.length}` });
    });
    args('--yes', '--format', 'json');
    expect(await dns(client)).toBe(0);
    expect(sent).toEqual(['TXT', 'TXT']);
    expect(payload().skipped[0].id).toBe('completed-mx');
  });
  it.each([
    'wrong-domain',
    'malformed',
    'large',
    'unsupported-record',
    'missing-file',
  ])('rejects %s before remote requests', async kind => {
    if (kind === 'wrong-domain')
      writeFileSync(file, JSON.stringify({ ...response, name: 'evil.test' }));
    if (kind === 'malformed') writeFileSync(file, '{ private-data-invalid');
    if (kind === 'large') writeFileSync(file, ' '.repeat(1024 * 1024 + 1));
    if (kind === 'unsupported-record')
      writeFileSync(
        file,
        JSON.stringify({
          ...response,
          records: [{ name: '@', type: 'A', value: '192.0.2.1' }],
        })
      );
    if (kind === 'missing-file') rmSync(file);
    const fetch = vi.spyOn(client, 'fetch');
    args('--yes', '--json');
    expect(await dns(client)).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(client.stdout.getFullOutput()).not.toContain('private-data-invalid');
  });
  it.each(
    [
      [],
      ['example.com'],
      ['https://example.com', '--resend', '/tmp/input'],
      ['example.com', '--resend', '/tmp/input', '--unknown'],
    ].map(argv => ({ argv }))
  )('rejects invalid arguments without DNS work', async ({ argv }) => {
    client.setArgv('dns', 'configure', ...argv, '--json');
    const fetch = vi.spyOn(client, 'fetch');
    expect(await dns(client)).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('never adds optional receiving records from a disabled capability', async () => {
    writeFileSync(
      file,
      JSON.stringify({
        ...response,
        capabilities: { receiving: 'disabled', sending: 'enabled' },
        records: [
          ...response.records,
          {
            record: 'Receiving',
            name: 'example.com',
            type: 'MX',
            value: 'inbound-mx.resend.com',
            priority: 10,
          },
        ],
      })
    );
    emptyRecords();
    const sent: Array<{ name: string; type: string }> = [];
    client.scenario.post('/v2/domains/example.com/records', (req, res) => {
      sent.push(req.body);
      res.json({ uid: `record-${sent.length}` });
    });
    args('--yes', '--json');
    expect(await dns(client)).toBe(0);
    expect(sent).toHaveLength(3);
    expect(
      sent.some(record => record.type === 'MX' && record.name === '')
    ).toBe(false);
    expect(payload().excluded).toEqual([
      {
        record: 'Receiving',
        reason: 'Receiving is not enabled in the response',
      },
    ]);
  });
  it('rejects a provider CAA policy change before any remote reads or writes', async () => {
    writeFileSync(
      file,
      JSON.stringify({
        ...response,
        records: [
          ...response.records,
          {
            record: 'TrackingCAA',
            name: '',
            type: 'CAA',
            value: '0 issue "amazon.com"',
          },
        ],
      })
    );
    const fetch = vi.spyOn(client, 'fetch');
    args('--yes', '--json');
    expect(await dns(client)).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(payload().message).toContain('certificate policy');
  });
});
