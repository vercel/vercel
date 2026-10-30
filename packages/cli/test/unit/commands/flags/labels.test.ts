import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import flags from '../../../../src/commands/flags';
import {
  setupUnitFixture,
  removeProjectLink,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeam } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { defaultFlagSettings, useFlags } from '../../../mocks/flags';
import type { FlagSettings } from '../../../../src/util/flags/types';
import type {
  EntityLabelsResponse,
  EntityLabelResult,
} from '../../../../src/util/flags/entity-labels';

const planAttribute = { entityKind: 'user', attributeKey: 'plan' };
const stderr = () => stripAnsi(client.stderr.getFullOutput());

describe('flags labels', () => {
  let settings: FlagSettings;
  let teamSlug: string;
  let response: EntityLabelsResponse | undefined;
  let apiError: { status: number; code: string; message: string } | undefined;
  const mutations = vi.fn();
  const settingsWrites = vi.fn();
  const settingsReads = vi.fn();
  const prompt = vi.fn();

  afterEach(() => {
    client.nonInteractive = false;
  });

  function run(...args: string[]) {
    client.setArgv('flags', 'labels', ...args);
    return flags(client);
  }

  function runLabels(action: string, ...args: string[]) {
    return run(action, 'user.plan', ...args);
  }

  function payload() {
    return JSON.parse(client.stdout.getFullOutput());
  }

  beforeEach(() => {
    settings = structuredClone(defaultFlagSettings);
    response = undefined;
    apiError = undefined;
    mutations.mockReset();
    settingsWrites.mockReset();
    settingsReads.mockReset();
    prompt.mockReset();
    client.scenario.patch(
      '/v1/projects/:projectId/feature-flags/settings',
      (_req, _res, next) => {
        settingsWrites();
        next?.();
      }
    );
    client.scenario.patch(
      '/v1/projects/:projectId/feature-flags/labels/bulk',
      (req, res) => {
        mutations(req.body, req.query);
        if (apiError) {
          res.status(apiError.status).json({ error: apiError });
          return;
        }
        res.json(response ?? { labels: req.body.items, errors: [] });
      }
    );
    useUser();
    teamSlug = useTeam('team_dummy').slug;
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
      accountId: 'team_dummy',
    });
    useFlags(
      undefined,
      undefined,
      settings,
      undefined,
      undefined,
      settingsReads
    );
    client.cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.stdin.isTTY = false;
    client.input.confirm = prompt;
    client.input.text = prompt;
    client.input.select = prompt;
  });

  it('lists labels as JSON without mutations', async () => {
    expect(await runLabels('ls', '--json')).toBe(0);
    expect(payload()).toEqual({
      status: 'ok',
      ...planAttribute,
      labels: expect.arrayContaining(
        settings.entities[0].attributes[0].labels!
      ),
      pagination: { next: null },
    });
    expect(mutations).not.toHaveBeenCalled();
    expect(settingsWrites).not.toHaveBeenCalled();
  });

  describe('list discovery', () => {
    function availableLists(count: number) {
      const attributes = Array.from({ length: count }, (_, i) => ({
        key: `plan_${String(i).padStart(2, '0')}`,
        type: 'string',
        labels: [{ value: 'same', label: 'Same' }],
      }));
      settings.entities = [
        { kind: 'user', label: 'User', attributes: [...attributes].reverse() },
      ];
      return attributes.map(attribute => ({
        id: null,
        attributes: [{ entityKind: 'user', attributeKey: attribute.key }],
        labelCount: 1,
      }));
    }

    describe.each([false, true])('default page (JSON: %s)', json => {
      it.each([0, 20, 21])('discovers %s lists', async count => {
        const lists = availableLists(count);
        expect(await run('ls', ...(json ? ['--json'] : []))).toBe(0);
        if (json) {
          expect(payload()).toEqual({
            status: 'ok',
            lists: lists.slice(0, 20),
            pagination: { next: count > 20 ? expect.any(String) : null },
          });
        } else {
          expect(stderr().match(/^\s+user\.plan_\d+\s+/gm) ?? []).toHaveLength(
            Math.min(count, 20)
          );
          expect(stderr().includes('Next page:')).toBe(count > 20);
          if (!count) expect(stderr()).toContain('No label lists found.');
          expect(client.stdout.getFullOutput()).toBe('');
        }
        expect(settingsReads).toHaveBeenCalledOnce();
        expect(mutations).not.toHaveBeenCalled();
        expect(settingsWrites).not.toHaveBeenCalled();
        expect(prompt).not.toHaveBeenCalled();
      });
    });

    it('includes separate attributes with identical labels and omits empty ones', async () => {
      const lists = availableLists(1);
      settings.entities[0].attributes.push(
        { key: 'empty', type: 'string', labels: [] },
        { key: 'unset', type: 'string' }
      );
      settings.entities.push({
        kind: 'account',
        label: 'Account',
        attributes: [
          {
            key: 'plan_00',
            type: 'stringArray',
            labels: [{ value: 'same', label: 'Same' }],
          },
        ],
      });
      client.nonInteractive = true;
      expect(await run('ls')).toBe(0);
      expect(payload().lists).toEqual([
        {
          id: null,
          attributes: [{ entityKind: 'account', attributeKey: 'plan_00' }],
          labelCount: 1,
        },
        ...lists,
      ]);
    });

    it('continues discovery with a copyable command and ends with next=null', async () => {
      const lists = availableLists(21);
      expect(await run('ls')).toBe(0);
      const command = stderr().split('Next page:\n')[1].trim();
      expect(command).toMatch(
        /^vercel flags labels ls --project vercel-flags-test /
      );
      expect(command).toContain('--scope');
      expect(command).not.toContain('--attribute');
      const cursor = command.match(/--next ([A-Za-z0-9_-]+)/)![1];
      expect(await run('ls', '--next', cursor, '--limit=50', '--json')).toBe(0);
      expect(payload()).toEqual({
        status: 'ok',
        lists: lists.slice(20),
        pagination: { next: null },
      });
    });

    it.each([false, true])('rejects mixed cursors: %s', async first => {
      availableLists(21);
      settings.entities[0].attributes[0].labels = [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ];
      const target = 'user.plan_20';
      expect(
        await run('ls', ...(first ? [] : [target]), '--limit=1', '--json')
      ).toBe(0);
      const cursor = payload().pagination.next;
      expect(
        await run('ls', ...(first ? [target] : []), '--next', cursor, '--json')
      ).toBe(2);
      expect(JSON.parse(client.stdout.getLastChunk({})).reason).toBe(
        'invalid_arguments'
      );
      expect(settingsReads).toHaveBeenCalledOnce();
    });
  });

  it.each(['set', 'apply'])('creates the first label with %s', async action => {
    delete settings.entities[0].attributes[0].labels;
    const args =
      action === 'set' ? ['pro', 'Pro Plan'] : ['--set=pro=Pro Plan'];
    expect(await runLabels(action, ...args, '--json')).toBe(0);
    expect(payload().labels).toEqual([
      {
        operation: 'upsert',
        ...planAttribute,
        value: 'pro',
        label: 'Pro Plan',
      },
    ]);
    expect(settingsWrites).not.toHaveBeenCalled();
  });

  describe.each(['ls', 'set', 'remove', 'apply'])('%s selectors', action => {
    const selectors = ['--list=lst_123', '--attribute=user.plan'];
    it.each(selectors)('rejects unsupported %s', async option => {
      expect(await runLabels(action, option, '--json')).toBe(2);
      expect(payload().message).toContain('unknown or unexpected option');
      expect(settingsReads).not.toHaveBeenCalled();
      expect(mutations).not.toHaveBeenCalled();
    });
  });

  it('does not advertise or accept create as an entry command', async () => {
    expect(await run('create', 'user.plan', 'pro', 'Pro Plan', '--json')).toBe(
      2
    );
    expect(payload().reason).toBe('invalid_arguments');
    expect(mutations).not.toHaveBeenCalled();
  });

  describe('pagination', () => {
    function setLabels(count: number) {
      const labels = Array.from({ length: count }, (_, i) => ({
        value: `value-${String(i).padStart(3, '0')}`,
        label: `Label ${i}`,
      }));
      settings.entities[0].attributes[0].labels = [...labels].reverse();
      return labels;
    }

    async function page(...args: string[]) {
      expect(await runLabels('ls', ...args, '--json')).toBe(0);
      return JSON.parse(client.stdout.getLastChunk({}));
    }

    describe.each([false, true])('default page (JSON: %s)', json => {
      it.each([0, 19, 20, 21, 40, 41])('bounds %s labels', async count => {
        const labels = setLabels(count);
        expect(await runLabels('ls', ...(json ? ['--json'] : []))).toBe(0);
        if (json) {
          expect(payload().labels).toEqual(labels.slice(0, 20));
          expect(payload().pagination.next).toEqual(
            count > 20 ? expect.any(String) : null
          );
        } else {
          expect(stderr().match(/^\s+value-\d{3}\s+/gm) ?? []).toHaveLength(
            Math.min(count, 20)
          );
          expect(stderr().includes('Next page:')).toBe(count > 20);
          expect(client.stdout.getFullOutput()).toBe('');
        }
        expect(settingsReads).toHaveBeenCalledOnce();
        expect(mutations).not.toHaveBeenCalled();
      });
    });

    it('continues deterministically and allows larger pages', async () => {
      const labels = setLabels(71);
      const first = await page();
      const second = await page('--limit=50', '--next', first.pagination.next);
      const last = await page('--next', second.pagination.next);
      expect([...first.labels, ...second.labels, ...last.labels]).toEqual(
        labels
      );
      expect(second.labels).toHaveLength(50);
      expect(last.pagination).toEqual({ next: null });
      expect(settings.entities[0].attributes[0].labels).toEqual(
        [...labels].reverse()
      );
      expect(settingsReads).toHaveBeenCalledTimes(3);
    });

    it('continues after a deleted value without offset skips', async () => {
      const labels = setLabels(5);
      const first = await page('--limit=2');
      settings.entities[0].attributes[0].labels = labels.slice(2);
      const next = await page('--next', first.pagination.next);
      expect(next.labels).toEqual(labels.slice(2));
      expect(next.pagination.next).toBeNull();
      settings.entities[0].attributes[0].labels = [];
      expect(
        (await page('--next', first.pagination.next)).pagination.next
      ).toBeNull();
    });

    it('preserves literal values across single-item pages', async () => {
      const values = ['', ' ', 'A', 'a=b', 'line\nbreak', 'é', '😀'];
      settings.entities[0].attributes[0].labels = [...values]
        .reverse()
        .map(value => ({ value, label: value }));
      let next: string | null = null;
      for (const value of values) {
        const result = await page(
          '--limit=1',
          ...(next === null ? [] : ['--next', next])
        );
        expect(result.labels).toEqual([{ value, label: value }]);
        next = result.pagination.next;
      }
      expect(next).toBeNull();
    });

    it('bounds non-interactive output', async () => {
      setLabels(21);
      client.nonInteractive = true;
      expect(await runLabels('ls')).toBe(0);
      expect(payload().labels).toHaveLength(20);
      expect(payload().pagination.next).toEqual(expect.any(String));
    });

    const invalidLimits = [
      '0',
      '-1',
      '1.5',
      'NaN',
      'Infinity',
      '9007199254740992',
      '',
    ];
    it.each(invalidLimits)('rejects limit %j', async limit => {
      expect(await runLabels('ls', `--limit=${limit}`, '--json')).toBe(2);
      expect(payload().reason).toBe('invalid_arguments');
      expect(payload().message).toContain('--limit');
      expect(settingsReads).not.toHaveBeenCalled();
    });

    const invalidCursors = [
      '',
      '20',
      'invalid!',
      'e30',
      Buffer.from('{"version":2}').toString('base64url'),
    ];
    it.each(invalidCursors)('rejects cursor %j', async cursor => {
      expect(await runLabels('ls', '--next', cursor, '--json')).toBe(2);
      expect(payload().reason).toBe('invalid_arguments');
      expect(payload().message).toContain('Omit --next to restart');
      expect(settingsReads).not.toHaveBeenCalled();
    });

    it('rejects a cursor from another attribute', async () => {
      setLabels(21);
      const first = await page();
      expect(
        await run(
          'ls',
          'user.userId',
          '--next',
          first.pagination.next,
          '--json'
        )
      ).toBe(2);
      expect(JSON.parse(client.stdout.getLastChunk({})).reason).toBe(
        'invalid_arguments'
      );
      expect(settingsReads).toHaveBeenCalledOnce();
    });

    it('rejects a cursor from another project', async () => {
      setLabels(21);
      const first = await page();
      useProject({
        ...defaultProject,
        id: 'other-project',
        name: 'other-project',
        accountId: 'team_dummy',
      });
      expect(
        await runLabels(
          'ls',
          '--project=other-project',
          '--next',
          first.pagination.next,
          '--json'
        )
      ).toBe(2);
      expect(JSON.parse(client.stdout.getLastChunk({})).message).toContain(
        'different project'
      );
      expect(settingsReads).toHaveBeenCalledOnce();
    });

    it('preserves safe context in a copyable next-page command', async () => {
      setLabels(3);
      useProject({
        ...defaultProject,
        id: 'prj_labels',
        name: 'vercel-flags-test',
        accountId: 'team_dummy',
      });
      expect(
        await runLabels(
          'ls',
          '--limit=1',
          '--project=vercel-flags-test',
          '-S',
          teamSlug,
          '--cwd',
          '/tmp/flags project',
          '--global-config',
          '/tmp/cli config',
          '--no-color',
          '--token=secret-token'
        )
      ).toBe(0);
      const command = stderr().split('Next page:\n')[1].trim();
      expect(command).toMatch(/^vercel flags labels ls /);
      expect(command).not.toContain('`');
      expect(command).toContain(
        'flags labels ls user.plan --project vercel-flags-test'
      );
      expect(command).not.toContain('prj_labels');
      expect(command).toContain('-S ');
      expect(command).not.toContain('--scope');
      expect(command).toContain("--cwd '/tmp/flags project'");
      expect(command).toContain("--global-config '/tmp/cli config'");
      expect(command).toContain('--no-color');
      expect(command).not.toMatch(/token|secret/);
      const cursor = command.match(/--next ([A-Za-z0-9_-]+)/)![1];
      client.telemetryEventStore.reset();
      const result = await page(
        '--limit=1',
        '--project=vercel-flags-test',
        '--next',
        cursor
      );
      expect(result.labels[0].value).toBe('value-001');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:labels', value: 'labels' },
        { key: 'subcommand:ls', value: 'ls' },
        { key: 'argument:attribute', value: '[REDACTED]' },
        { key: 'option:project', value: '[REDACTED]' },
        { key: 'option:next', value: '[REDACTED]' },
        { key: 'option:limit', value: '1' },
        { key: 'flag:json', value: 'TRUE' },
      ]);
    });

    it.each(['set', 'rm', 'apply'])('rejects paging on %s', async action => {
      expect(await runLabels(action, '--limit=1', '--json')).toBe(2);
      expect(payload().message).toContain('unknown or unexpected option');
      expect(mutations).not.toHaveBeenCalled();
    });

    it('documents listing pagination', async () => {
      expect(await run('ls', '--help')).toBe(0);
      const help = stderr().replace(/\s+/g, ' ');
      expect(help).toContain('--limit');
      expect(help).toContain('--next');
      expect(help).toContain('default: 20');
    });
  });

  it('prints a label table with project and attribute context', async () => {
    expect(await runLabels('ls')).toBe(0);
    const output = stderr();
    expect(output).toContain('vercel-flags-test');
    expect(output).toContain('user.plan');
    expect(output).toContain('Value');
    expect(output).toContain('Label');
    expect(output).toContain('Pro Plan');
    expect(output).not.toContain('"pro"');
    expect(output).not.toContain('"Pro Plan"');
    expect(client.stdout.getFullOutput()).toBe('');
  });

  it('quotes empty, padded, and escaped table values', async () => {
    settings.entities[0].attributes[0].labels = [
      { value: '', label: '' },
      { value: ' padded ', label: ' padded label ' },
      { value: 'line\nbreak', label: 'tab\tlabel' },
    ];
    expect(await runLabels('ls')).toBe(0);
    const output = stderr();
    expect(output).toContain('""');
    expect(output).toContain('" padded "');
    expect(output).toContain('" padded label "');
    expect(output).toContain('"line\\nbreak"');
    expect(output).toContain('"tab\\tlabel"');
    expect(output).not.toContain('line\nbreak');
  });

  it.each(['string', 'stringArray'])('applies labels for %s', async type => {
    settings.entities[0].attributes[0].type = type;
    const before = structuredClone(settings);
    expect(
      await runLabels(
        'apply',
        '--set=pro=Professional',
        '--set=new=New Plan',
        '--remove=enterprise',
        '--remove=legacy',
        '--json'
      )
    ).toBe(0);
    const items = [
      {
        operation: 'delete',
        value: 'enterprise',
        ...planAttribute,
      },
      { operation: 'delete', value: 'legacy', ...planAttribute },
      {
        operation: 'upsert',
        value: 'pro',
        label: 'Professional',
        ...planAttribute,
      },
      {
        operation: 'upsert',
        value: 'new',
        label: 'New Plan',
        ...planAttribute,
      },
    ];
    expect(mutations).toHaveBeenCalledExactlyOnceWith(
      { items },
      expect.objectContaining({ teamId: 'team_dummy' })
    );
    expect(payload()).toEqual({
      status: 'ok',
      ...planAttribute,
      labels: items,
      errors: [],
    });
    expect(settingsWrites).not.toHaveBeenCalled();
    expect(settings).toEqual(before);
    expect(prompt).not.toHaveBeenCalled();
  });

  it.each([
    ['pro', 'Pro Plan'],
    ['', ''],
    ['id=123', 'Test=user'],
    ['user.plan', 'Another attribute as a literal value'],
    [' padded ', ' Label '],
    ['--literal', '--help'],
  ])('sets literal value %j to label %j', async (value, label) => {
    expect(await runLabels('set', '--json', '--', value, label)).toBe(0);
    expect(payload().labels).toEqual([
      { ...planAttribute, operation: 'upsert', value, label },
    ]);
    expect(settingsWrites).not.toHaveBeenCalled();
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:labels', value: 'labels' },
      { key: 'subcommand:set', value: 'set' },
      { key: 'argument:attribute', value: '[REDACTED]' },
      { key: 'argument:value', value: '[REDACTED]' },
      { key: 'argument:label', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it.each(['ls', 'list', 'rm', 'remove'])('supports %s', async action => {
    const remove = action === 'rm' || action === 'remove';
    expect(await runLabels(action, '--json', ...(remove ? [''] : []))).toBe(0);
    expect(mutations).toHaveBeenCalledTimes(remove ? 1 : 0);
    if (remove)
      expect(payload().labels[0]).toMatchObject({
        operation: 'delete',
        value: '',
      });
  });

  const invalidTargets = ['user', 'user.plan.extra', '.plan', 'user.', ''];
  it.each(invalidTargets)('rejects target %j', async target => {
    expect(await run('ls', target, '--json')).toBe(2);
    expect(payload().reason).toBe('invalid_arguments');
    expect(settingsReads).not.toHaveBeenCalled();
  });

  it.each(['ls', 'set', 'rm'])('rejects apply options on %s', async action => {
    expect(await runLabels(action, '--set=pro=Pro', '--json')).toBe(2);
    expect(payload().message).toContain('unknown or unexpected option');
    expect(mutations).not.toHaveBeenCalled();
  });

  it('lists the actions in group help', async () => {
    expect(await run('--help')).toBe(0);
    const output = stderr();
    for (const action of ['ls', 'set', 'remove', 'apply'])
      expect(output).toContain(action);
    expect(output).toContain('string or stringArray');
  });

  it('supports raw JSON values containing equals signs', async () => {
    const operations = [
      { operation: 'upsert', value: 'id=123', label: 'Test=user' },
    ];
    expect(
      await run(
        'apply',
        'user.userId',
        '--data',
        JSON.stringify(operations),
        '--json'
      )
    ).toBe(0);
    expect(mutations.mock.calls[0][0].items).toEqual([
      { ...operations[0], entityKind: 'user', attributeKey: 'userId' },
    ]);
  });

  it('preserves spaces, empty values, and equals signs in labels', async () => {
    expect(
      await run(
        'apply',
        'user.userId',
        '--set= padded = Label=one ',
        '--set==Empty value',
        '--set=empty=',
        '--json'
      )
    ).toBe(0);
    expect(
      payload().labels.map(
        ({ value, label }: EntityLabelResult & { label: string }) => ({
          value,
          label,
        })
      )
    ).toEqual([
      { value: ' padded ', label: ' Label=one ' },
      { value: '', label: 'Empty value' },
      { value: 'empty', label: '' },
    ]);
  });

  it('accepts 128 Unicode code points, matching the API maxLength', async () => {
    const value = '😀'.repeat(128);
    expect(
      await runLabels('apply', '--set', `${value}=${value}`, '--json')
    ).toBe(0);
    expect(payload().labels[0]).toMatchObject({ value, label: value });
  });

  it.each(['set', 'data'])('rejects 129 code points in --%s', async option => {
    const value = '😀'.repeat(129);
    const input =
      option === 'set'
        ? `${value}=Label`
        : JSON.stringify([{ operation: 'upsert', value: 'pro', label: value }]);
    expect(await runLabels('apply', `--${option}`, input, '--json')).toBe(2);
    expect(payload().message).toContain('at most 128 characters');
    expect(settingsReads).not.toHaveBeenCalled();
    expect(mutations).not.toHaveBeenCalled();
  });

  it('reports the applied set and remove counts in human output', async () => {
    expect(
      await runLabels(
        'apply',
        '--set=pro=Pro',
        '--set=hobby=Hobby',
        '--remove=enterprise'
      )
    ).toBe(0);
    expect(stderr()).toContain(
      'Value labels updated for user.plan: 2 set, 1 removed'
    );
  });

  it.each([false, true])('removes missing labels (TTY: %s)', async tty => {
    client.stdin.isTTY = tty;
    expect(await runLabels('rm', 'missing')).toBe(0);
    expect(mutations).toHaveBeenCalledTimes(1);
    expect(prompt).not.toHaveBeenCalled();
    expect(stderr()).toContain(
      'Value labels updated for user.plan: 0 set, 1 removed'
    );
  });

  it.each([
    {
      args: ['ls', 'user.plan', 'extra'],
      message: 'accepts only one attribute',
    },
    {
      args: ['ls', 'bad/kind.plan'],
      message: 'Invalid entity kind',
    },
    {
      args: ['ls', 'user.bad/key'],
      message: 'Invalid attribute key',
    },
    {
      args: ['apply', 'user.plan', '--set=pro'],
      message: 'Use --set VALUE=LABEL',
    },
    {
      args: ['apply', 'user.plan', '--set', `pro=${'a'.repeat(129)}`],
      message: 'at most 128 characters',
    },
    {
      args: ['apply', 'user.plan', '--remove', 'a'.repeat(129)],
      message: 'at most 128 characters',
    },
    {
      args: ['apply', 'user.plan', '--set=pro=Pro', '--remove=pro'],
      message: 'only one label operation',
    },
    {
      args: ['apply', 'user.plan', '--remove=pro', '--remove=pro'],
      message: 'only one label operation',
    },
    {
      args: ['apply', 'user.plan', '--set=pro=Pro', '--set=pro=Other'],
      message: 'only one label operation',
    },
    {
      args: ['apply', 'user.plan', '--unknown'],
      message: 'unknown or unexpected option',
    },
  ])('rejects invalid input: $message', async ({ args, message }) => {
    expect(await run(...args, '--json')).toBe(2);
    expect(payload().status).toBe('error');
    expect(payload().message).toContain(message);
    expect(settingsReads).not.toHaveBeenCalled();
    expect(mutations).not.toHaveBeenCalled();
  });

  it.each([
    'invalid',
    '{}',
    '[]',
    '[null]',
    '[{"operation":"create","value":"pro","label":"Pro"}]',
    '[{"operation":"upsert","value":1,"label":"Pro"}]',
    '[{"operation":"upsert","value":"pro"}]',
    '[{"operation":"delete","value":"pro","label":"Pro"}]',
    '[{"operation":"delete","value":"pro","entityKind":"other"}]',
  ])('rejects invalid JSON operations: %s', async data => {
    expect(await runLabels('apply', '--data', data, '--json')).toBe(2);
    expect(payload().reason).toBe('invalid_arguments');
    expect(settingsReads).not.toHaveBeenCalled();
    expect(mutations).not.toHaveBeenCalled();
  });

  it('rejects JSON combined with convenience options', async () => {
    expect(
      await runLabels(
        'apply',
        '--data',
        '[{"operation":"delete","value":"pro"}]',
        '--remove=enterprise',
        '--json'
      )
    ).toBe(2);
    expect(payload().message).toContain("Can't combine --data");
    expect(mutations).not.toHaveBeenCalled();
  });

  it.each([100, 101])('limits batches to 100: %s', async count => {
    const operations = Array.from({ length: count }, (_, i) => ({
      operation: 'upsert',
      value: `value-${i}`,
      label: 'Label',
    }));
    expect(
      await runLabels('apply', '--data', JSON.stringify(operations), '--json')
    ).toBe(count === 100 ? 0 : 2);
    expect(mutations).toHaveBeenCalledTimes(count === 100 ? 1 : 0);
  });

  const nonLabelTypes = ['number', 'boolean', 'timestamp'];
  it.each(nonLabelTypes)('rejects labels for %s attributes', async type => {
    settings.entities[0].attributes[0].type = type;
    expect(await runLabels('apply', '--set=pro=Pro', '--json')).toBe(2);
    expect(payload().message).toContain('only for string and stringArray');
    expect(mutations).not.toHaveBeenCalled();
  });

  const attributeTypes = ['string', ...nonLabelTypes];
  describe.each(attributeTypes)('listing %s attributes', type => {
    it.each([false, true])('returns an empty list (JSON: %s)', async json => {
      settings.entities[0].attributes.push({ key: 'empty', type });
      expect(await run('ls', 'user.empty', ...(json ? ['--json'] : []))).toBe(
        0
      );
      if (json) expect(payload().labels).toEqual([]);
      else expect(stderr()).toContain('No value labels found.');
      expect(mutations).not.toHaveBeenCalled();
    });
  });

  it.each([
    ['missing', 'plan'],
    ['user', 'missing'],
  ])('rejects missing %s.%s', async (kind, attribute) => {
    expect(
      await run('apply', `${kind}.${attribute}`, '--set=pro=Pro', '--json')
    ).toBe(1);
    expect(payload().reason).toBe('not_found');
    expect(payload().message).toBe(
      kind === 'missing'
        ? 'Entity missing was not found in this project.'
        : 'Attribute user.missing was not found in this project.'
    );
    expect(mutations).not.toHaveBeenCalled();
  });

  it('explains the recovery command after a human error', async () => {
    expect(await run('ls', 'missing.plan')).toBe(1);
    const output = stderr();
    expect(output).toContain('Entity missing was not found in this project.');
    expect(output).toContain('Inspect entities and labels before retrying:\n');
    expect(output).toContain('vercel flags entities ls --json');
    expect(output).not.toContain('does not exist');
  });

  it.each([false, true])('reports partial results (JSON: %s)', async json => {
    response = {
      labels: [
        {
          ...planAttribute,
          value: 'pro',
          label: 'Professional',
          operation: 'upsert',
        },
      ],
      errors: [
        {
          ...planAttribute,
          value: 'new',
          code: 'too_many_labels',
          message: 'Attribute "plan" cannot have more than 256 labels.',
        },
      ],
    };
    expect(
      await runLabels(
        'apply',
        '--set=pro=Professional',
        '--set=new=New',
        ...(json ? ['--json'] : [])
      )
    ).toBe(1);
    expect(mutations).toHaveBeenCalledTimes(1);
    if (json) {
      expect(payload()).toMatchObject({
        status: 'error',
        reason: 'api_error',
        ...response,
      });
      expect(payload().next[0].command).toContain(
        'flags labels ls user.plan --json'
      );
    } else {
      const output = stderr();
      expect(output).toContain('1 label operation applied, 1 failed.');
      expect(output).toContain('too_many_labels');
      expect(output).toContain(
        'Inspect entities and labels before retrying:\n'
      );
      expect(output).not.toContain('Value labels updated');
    }
  });

  it.each([403, 429, 500])('does not retry HTTP %s', async status => {
    apiError = {
      status,
      code: 'test_error',
      message: 'Label request failed.',
    };
    expect(await runLabels('apply', '--set=pro=Pro', '--json')).toBe(1);
    expect(payload()).toMatchObject({
      status: 'error',
      reason: status === 403 ? 'permission_denied' : 'api_error',
      message: `Label request failed. (${status})`,
    });
    expect(mutations).toHaveBeenCalledTimes(1);
    expect(payload().next[0].command).not.toContain('--set');
  });

  it.each([
    'entity_not_found',
    'attribute_not_found',
    'label_already_exists',
    'too_many_labels',
  ])('reports per-item errors: %s', async code => {
    response = {
      labels: [],
      errors: [
        {
          ...planAttribute,
          value: 'pro',
          code,
          message: 'Label operation failed.',
        },
      ],
    };
    expect(await runLabels('apply', '--set=pro=Pro', '--json')).toBe(1);
    expect(payload()).toMatchObject({ status: 'error', ...response });
    expect(mutations).toHaveBeenCalledTimes(1);
    expect(settingsWrites).not.toHaveBeenCalled();
  });

  describe.each([false, true])('project errors (agent: %s)', nonInteractive => {
    beforeEach(() => {
      client.nonInteractive = nonInteractive;
    });

    it('returns JSON and a link action when no project is linked', async () => {
      removeProjectLink(client.cwd);
      expect(await runLabels('ls', ...(nonInteractive ? [] : ['--json']))).toBe(
        1
      );
      expect(payload()).toMatchObject({
        status: 'action_required',
        reason: 'not_linked',
      });
      expect(payload().next[0].command).toBe('vercel link');
      expect(stderr()).not.toContain("Your codebase isn't linked");
      expect(settingsReads).not.toHaveBeenCalled();
      expect(mutations).not.toHaveBeenCalled();
      expect(prompt).not.toHaveBeenCalled();
    });

    it('returns JSON for an unknown explicit project without retrying that project', async () => {
      removeProjectLink(client.cwd);
      client.config.currentTeam = 'team_dummy';
      client.scenario.get('/v9/projects/missing-project', (_req, res) => {
        res.status(404).json({
          error: { code: 'not_found', message: 'Project not found' },
        });
      });
      expect(
        await runLabels(
          'ls',
          '--project=missing-project',
          ...(nonInteractive ? [] : ['--json'])
        )
      ).toBe(1);
      expect(payload()).toMatchObject({
        status: 'error',
        reason: 'project_not_found',
      });
      expect(payload().next[0].command).toBe('vercel project ls');
      expect(payload().next[0].command).not.toContain('--project');
      expect(settingsReads).not.toHaveBeenCalled();
      expect(mutations).not.toHaveBeenCalled();
      expect(prompt).not.toHaveBeenCalled();
    });

    it.each([
      { args: [] },
      { args: ['set'] },
      { args: ['rm'] },
      { args: ['apply'] },
      { args: ['set', 'user.plan', 'pro'] },
      { args: ['rm', 'user.plan'] },
      { args: ['apply', 'user.plan'] },
    ])('requests missing input for $args', async ({ args }) => {
      expect(await run(...args, ...(nonInteractive ? [] : ['--json']))).toBe(2);
      expect(payload()).toMatchObject({
        status: 'action_required',
        reason: 'missing_arguments',
      });
      expect(settingsReads).not.toHaveBeenCalled();
      expect(mutations).not.toHaveBeenCalled();
      expect(prompt).not.toHaveBeenCalled();
    });
  });

  it('uses an explicit project without a local link', async () => {
    removeProjectLink(client.cwd);
    expect(await runLabels('ls', '--project=vercel-flags-test', '--json')).toBe(
      0
    );
    expect(payload().labels).toHaveLength(2);
  });

  it('emits JSON in non-interactive mode and preserves safe recovery context', async () => {
    client.nonInteractive = true;
    client.stdin.isTTY = true;
    expect(
      await run(
        'ls',
        'user.missing',
        '--project',
        'vercel-flags-test',
        '--non-interactive',
        '--token=secret-token'
      )
    ).toBe(1);
    expect(payload().reason).toBe('not_found');
    expect(payload().next[0].command).toContain('--project vercel-flags-test');
    expect(payload().next[0].command).toContain('--non-interactive');
    expect(JSON.stringify(payload())).not.toContain('secret-token');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('returns mutation results as JSON in non-interactive mode without --json', async () => {
    client.nonInteractive = true;
    client.stdin.isTTY = true;
    expect(await runLabels('apply', '--set=pro=Pro', '--non-interactive')).toBe(
      0
    );
    expect(payload()).toMatchObject({ status: 'ok', errors: [] });
    expect(prompt).not.toHaveBeenCalled();
  });

  it('redacts label arguments in telemetry', async () => {
    expect(
      await runLabels(
        'apply',
        '--set=pro=Private label',
        '--remove=private-value',
        '--json'
      )
    ).toBe(0);
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:labels', value: 'labels' },
      { key: 'subcommand:apply', value: 'apply' },
      { key: 'argument:attribute', value: '[REDACTED]' },
      { key: 'option:set', value: '[REDACTED]' },
      { key: 'option:remove', value: '[REDACTED]' },
      { key: 'flag:json', value: 'TRUE' },
    ]);
  });

  it('documents the command and tracks help', async () => {
    expect(await run('apply', '--help')).toBe(0);
    const output = stderr().replace(/\s+/g, ' ');
    expect(output).toContain('--set');
    expect(output).toContain('--remove');
    expect(output).toContain('--data');
    expect(output).toContain('Apply label operations from a JSON array');
    expect(output).not.toContain('Maximum 100 operations');
    expect(output).toContain('cannot combine with --set or --remove');
    expect(output).toContain('vercel flags labels apply');
    expect(output).toContain('ENTITY.ATTRIBUTE');
    expect(output).not.toContain('--attribute');
    expect(output).not.toContain('--list');
    expect(output).not.toContain('flags entities labels');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:labels', value: 'labels' },
      { key: 'flag:help', value: 'flags labels:apply' },
    ]);
    expect(mutations).not.toHaveBeenCalled();
  });
});
