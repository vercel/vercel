import { describe, expect, it, beforeEach, vi } from 'vitest';
import stripAnsi from 'strip-ansi';
import chars from '../../../../src/util/output/chars';
import flags from '../../../../src/commands/flags';
import {
  removeProjectLink,
  setupUnitFixture,
} from '../../../helpers/setup-unit-fixture';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import {
  defaultFlags,
  defaultFlagSettings,
  useFlags,
} from '../../../mocks/flags';
import type { Flag, FlagSettings } from '../../../../src/util/flags/types';
import { getExitCodeForReason } from '../../../../src/util/agent-output-constants';

const deviceEntity = {
  kind: 'device',
  label: 'Device',
  attributes: [{ key: 'os', type: 'string' }],
};

describe('flags entities', () => {
  let settings: FlagSettings;
  let projectFlags: Flag[];
  let settingsError:
    | { status: number; code: string; message: string }
    | undefined;
  const confirmMock = vi.fn();
  const textMock = vi.fn();
  const selectMock = vi.fn();
  const requestMock = vi.fn();

  function run(...args: string[]) {
    client.setArgv('flags', 'entities', ...args);
    return flags(client);
  }

  async function runAgentError(...args: string[]) {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as () => never);
    client.nonInteractive = true;
    try {
      const exitCode = await run(...args, '--non-interactive');
      const payload = JSON.parse(client.stdout.getFullOutput());
      // The exit code matches the one the payload's reason calls for.
      expect(exitCode).toBe(getExitCodeForReason(payload.reason));
      return payload;
    } finally {
      exitSpy.mockRestore();
      client.nonInteractive = false;
    }
  }

  beforeEach(() => {
    settingsError = undefined;
    client.scenario.get(
      '/v1/projects/:projectId/feature-flags/settings',
      (_req, res, next) => {
        if (settingsError) {
          res.status(settingsError.status).json({ error: settingsError });
        } else {
          next?.();
        }
      }
    );
    settings = JSON.parse(JSON.stringify(defaultFlagSettings)) as FlagSettings;
    settings.entities.push(JSON.parse(JSON.stringify(deviceEntity)));
    requestMock.mockReset();
    for (const method of ['get', 'patch'] as const) {
      client.scenario[method]('*', (req, _res, next) => {
        requestMock(req.method, req.url);
        next?.();
      });
    }
    // Simulate an index that has not caught up with the database. Entity
    // mutation guards must still see all references through the v1 listing.
    client.scenario.get(
      '/v2/projects/:projectId/feature-flags/flags',
      (_req, res) => {
        res.json({ data: [], pagination: { next: null } });
      }
    );
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-flags-test',
      name: 'vercel-flags-test',
      accountId: 'team_dummy',
    });
    projectFlags = structuredClone(defaultFlags);
    useFlags(projectFlags, undefined, settings);
    const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
    client.cwd = cwd;
    client.stdin.isTTY = false;
    client.input.confirm = confirmMock;
    client.input.text = textMock;
    client.input.select = selectMock;
    confirmMock.mockReset();
    textMock.mockReset();
    selectMock.mockReset();
  });

  describe('--help', () => {
    it('explains that changing an attribute type removes value labels', async () => {
      expect(await run('update', '--help')).toBe(0);
      expect(client.stderr.getFullOutput().replace(/\s+/g, ' ')).toContain(
        'Changing the type also removes existing value labels.'
      );
    });
    it('tracks telemetry', async () => {
      await expect(run('--help')).resolves.toEqual(0);
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:entities', value: 'entities' },
        { key: 'flag:help', value: 'flags entities' },
      ]);
    });

    it('lists the valid attribute types in create help', async () => {
      await expect(run('create', '--help')).resolves.toEqual(0);
      expect(client.stderr.getFullOutput().replace(/\s+/g, ' ')).toContain(
        'Valid types: string, number, boolean, stringArray, timestamp'
      );
    });
  });

  it('errors when invoked without subcommand', async () => {
    await expect(run()).resolves.toBe(2);
  });

  describe.each([
    'fallthrough',
    'rule',
    'definition only',
  ])('experiment references (%s)', location => {
    beforeEach(() => {
      const flag = projectFlags[0];
      flag.experiment = {
        base: { type: 'entity', kind: 'device', attribute: 'os' },
      };
      // Exercise the API's experiment outcome, which is not part of the
      // CLI's editable outcome types.
      if (location === 'fallthrough') {
        Object.assign(flag.environments.production, {
          fallthrough: { type: 'experiment' },
        });
      } else if (location === 'rule') {
        Object.assign(flag.environments.production.rules[0], {
          outcome: { type: 'experiment' },
        });
      }
    });

    it('allows deleting an unrelated unused entity', async () => {
      settings.entities.push({
        kind: 'service',
        label: 'Service',
        attributes: [],
      });

      expect(await run('rm', 'service', '--yes')).toBe(0);
      expect(settings.entities.map(entity => entity.kind)).toEqual([
        'user',
        'device',
      ]);
    });

    it.each([
      ['rm', 'device', '--yes'],
      ['update', 'device', '--remove-attribute', 'os'],
      ['update', 'device', '--set-attribute-type', 'os:number'],
    ])('blocks changing the assignment base with %s', async (...args) => {
      expect(await run(...args)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Used by feature flags: my-feature'
      );
      expect(settings.entities[1]).toEqual(deviceEntity);
    });
  });

  it.each([
    ['create'],
    ['update', 'device'],
    ['update', '--label', 'New label'],
    ['rm'],
    ['rm', 'missing', '--yes'],
    ['rm', 'user', '--yes'],
    ['update', 'user', '--remove-attribute', 'plan'],
    ['rm', 'device'],
  ])('preserves --project in %s recovery commands', async (...args) => {
    const payload = await runAgentError(
      ...args,
      '--project',
      'vercel-flags-test'
    );
    expect(payload.next.length).toBeGreaterThan(0);
    for (const next of payload.next) {
      expect(next.command).toContain('--project vercel-flags-test');
      expect(next.command).toContain('--non-interactive');
    }
    expect(settings.entities).toHaveLength(2);
  });

  it.each([
    {
      args: ['create', 'team', '--attribute', 'tags:string[]'],
      error: 'Invalid type "string[]" for attribute "tags"',
      exitCode: 2,
    },
    {
      args: ['create', 'team', '--attribute', 'id'],
      error: 'Use KEY:TYPE',
      exitCode: 2,
    },
    {
      args: ['create', 'my team'],
      error: 'Invalid entity kind "my team"',
      exitCode: 2,
    },
    {
      args: ['create', 'user'],
      error: 'Entity user already exists',
      exitCode: 1,
    },
    {
      args: ['update', 'user', '--add-attribute', 'plan:string'],
      error: 'Attribute "plan" already exists on entity "user"',
      exitCode: 1,
    },
    {
      args: ['update', 'user', '--remove-attribute', 'missing'],
      error: 'Attribute user.missing does not exist',
      exitCode: 1,
    },
    {
      args: [
        'update',
        'user',
        '--remove-attribute',
        'plan',
        '--add-attribute',
        'plan:number',
      ],
      error: 'can not be removed and changed in the same command',
      exitCode: 2,
    },
    {
      args: ['update', 'user'],
      error: 'Provide at least one change',
      exitCode: 2,
    },
    {
      args: ['update', 'missing', '--label', 'Missing'],
      error: 'Entity missing was not found',
      exitCode: 1,
    },
    {
      args: ['rm', 'missing', '--yes'],
      error: 'Entity missing was not found',
      exitCode: 1,
    },
  ])('rejects $args', async ({ args, error, exitCode }) => {
    expect(await run(...args)).toBe(exitCode);
    expect(client.stderr.getFullOutput()).toContain(error);
    expect(settings.entities).toHaveLength(2);
    expect(requestMock.mock.calls.some(([method]) => method === 'PATCH')).toBe(
      false
    );
  });

  describe('ls', () => {
    describe('before Flags is set up', () => {
      beforeEach(() => {
        settingsError = {
          status: 404,
          code: 'settings_not_found',
          message: 'Settings not found',
        };
      });

      it.each([true, false])('prints setup guidance (TTY: %s)', async isTTY => {
        client.stdin.isTTY = isTTY;
        expect(await run('ls', '--project', 'vercel-flags-test')).toBe(0);
        const out = client.stderr.getFullOutput();
        expect(out).toContain('Flags is not set up for');
        expect(out).toContain(
          'vercel flags create my-feature --project vercel-flags-test'
        );
        expect(out).not.toContain('Settings not found');
        expect(out).not.toContain('flags entities create');
        expect(client.stdout.getFullOutput()).toBe('');
      });

      it('returns an empty JSON list in non-interactive mode', async () => {
        client.nonInteractive = true;
        try {
          expect(await run('ls', '--json', '--non-interactive')).toBe(0);
          expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
            entities: [],
          });
          expect(client.stderr.getFullOutput()).not.toContain(
            'Settings not found'
          );
          expect(client.stderr.getFullOutput()).not.toContain(
            'Create your first flag'
          );
        } finally {
          client.nonInteractive = false;
        }
      });
    });

    it.each([
      { status: 403, code: 'forbidden', message: 'Access denied' },
      { status: 404, code: 'not_found', message: 'Project not found' },
    ])('preserves other API errors ($code)', async error => {
      settingsError = error;
      expect(await run('ls', '--json')).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(error.message);
      expect(client.stdout.getFullOutput()).toBe('');
    });

    it('lists entities with their attributes', async () => {
      const exitCode = await run('ls');

      expect(exitCode).toEqual(0);
      const out = client.stderr.getFullOutput();
      expect(out).toContain('2 feature flag entities found');
      expect(out).toContain('user');
      expect(out).toContain('plan:');
      expect(out).toContain('signupAt:');
      expect(out).toContain('device');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:entities', value: 'entities' },
        { key: 'subcommand:ls', value: 'ls' },
      ]);
    });

    it('lists entities as JSON', async () => {
      const exitCode = await run('ls', '--json');

      expect(exitCode).toEqual(0);
      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.entities).toHaveLength(2);
      expect(parsed.entities[0]).toMatchObject({ kind: 'user', label: 'User' });
      expect(parsed.entities[0].attributes[0]).toMatchObject({
        key: 'plan',
        type: 'string',
      });
    });

    it('lists entities with --project when the cwd is not linked', async () => {
      const cwd = setupUnitFixture('commands/flags/vercel-flags-test');
      removeProjectLink(cwd);
      client.cwd = cwd;

      const exitCode = await run(
        'ls',
        '--project',
        'vercel-flags-test',
        '--json'
      );

      expect(exitCode).toEqual(0);
      expect(JSON.parse(client.stdout.getFullOutput()).entities).toHaveLength(
        2
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:entities', value: 'entities' },
        { key: 'subcommand:ls', value: 'ls' },
        { key: 'option:project', value: '[REDACTED]' },
        { key: 'flag:json', value: 'TRUE' },
      ]);
    });

    it('prints an empty state with a create hint', async () => {
      settings.entities = [];

      const exitCode = await run('ls');

      expect(exitCode).toEqual(0);
      const out = client.stderr.getFullOutput();
      expect(out).toContain('No feature flag entities found');
      expect(out).toContain('flags entities create');
    });
  });

  describe('create', () => {
    it('trims both parts of an attribute', async () => {
      expect(
        await run('create', 'team', '--attribute', ' id : string ', '--json')
      ).toBe(0);
      expect(
        JSON.parse(client.stdout.getFullOutput()).entity.attributes
      ).toEqual([{ key: 'id', type: 'string' }]);
    });

    it.each([
      'id',
      ':string',
      'id:',
      ' : string',
      'id: ',
      'id:string:extra',
    ])('rejects malformed attributes (%s) before making requests', async attribute => {
      expect(await run('create', 'team', '--attribute', attribute)).toBe(2);
      expect(client.stderr.getFullOutput()).toContain('Use KEY:TYPE');
      expect(requestMock).not.toHaveBeenCalled();
    });

    it('preserves edits made while collecting the label', async () => {
      client.stdin.isTTY = true;
      textMock.mockImplementationOnce(async () => {
        settings.entities.push({
          kind: 'service',
          label: 'Service',
          attributes: [],
        });
        settings.entities[0].attributes[0].labels!.push({
          value: 'team',
          label: 'Team',
        });
        return ' Team ';
      });

      expect(
        await run('create', 'team', '--attribute', 'id:string', '--json')
      ).toBe(0);
      expect(settings.entities.map(entity => entity.kind)).toEqual([
        'user',
        'device',
        'service',
        'team',
      ]);
      expect(settings.entities[0].attributes[0].labels).toHaveLength(3);
      expect(JSON.parse(client.stdout.getFullOutput()).entity.label).toBe(
        'Team'
      );
    });

    it('rejects a kind created by another editor while prompting', async () => {
      client.stdin.isTTY = true;
      confirmMock.mockImplementationOnce(async () => {
        settings.entities.push({
          kind: 'team',
          label: 'Existing team',
          attributes: [],
        });
        return false;
      });

      expect(await run('create', 'team', '--label', 'Team')).toBe(1);
      expect(settings.entities[2].label).toBe('Existing team');
      expect(
        requestMock.mock.calls.some(([method]) => method === 'PATCH')
      ).toBe(false);
    });

    it.each(['User', ' User '])('rejects a duplicate label %j', async label => {
      expect(await run('create', 'member', '--label', label)).toBe(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Entity label "User" is already used'
      );
      expect(settings.entities).toHaveLength(2);
    });

    it('trims an explicit label before storing it', async () => {
      expect(await run('create', 'team', '--label', ' Team ', '--json')).toBe(
        0
      );
      expect(JSON.parse(client.stdout.getFullOutput()).entity.label).toBe(
        'Team'
      );
    });
    it('creates an entity with attributes', async () => {
      const exitCode = await run(
        'create',
        'team',
        '--label',
        'Team',
        '--attribute',
        'id:string',
        '--attribute',
        'features:stringArray'
      );

      expect(exitCode).toEqual(0);
      expect(settings.entities).toHaveLength(3);
      expect(settings.entities[2]).toEqual({
        kind: 'team',
        label: 'Team',
        attributes: [
          { key: 'id', type: 'string' },
          { key: 'features', type: 'stringArray' },
        ],
      });
      // Existing entities, including labels, are sent back unchanged.
      expect(settings.entities[0].attributes[0].labels).toHaveLength(2);
      const out = client.stderr.getFullOutput();
      expect(out).toContain('Feature flag entity team created');
      expect(out).toContain('features  stringArray');
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:entities', value: 'entities' },
        { key: 'subcommand:create', value: 'create' },
        { key: 'argument:kind', value: '[REDACTED]' },
        { key: 'option:label', value: '[REDACTED]' },
        { key: 'option:attribute', value: '[REDACTED]' },
      ]);
    });

    it('derives the label from the kind when omitted', async () => {
      const exitCode = await run('create', 'api-client', '--json');

      expect(exitCode).toEqual(0);
      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(parsed.entity).toEqual({
        kind: 'api-client',
        label: 'Api Client',
        attributes: [],
      });
    });

    it('errors when the kind is missing', async () => {
      const exitCode = await run('create');

      expect(exitCode).toEqual(2);
      expect(client.stderr.getFullOutput()).toContain(
        'Provide a kind for the entity'
      );
      expect(stripAnsi(client.stderr.getFullOutput())).toMatch(
        new RegExp(`^${chars.fatal} Provide`, 'm')
      );
      expect(client.stderr.getFullOutput()).not.toMatch(
        /Please provide|Error:/
      );
    });

    it('emits structured JSON in non-interactive mode when the kind is missing', async () => {
      const parsed = await runAgentError('create');
      expect(parsed.status).toBe('error');
      expect(parsed.reason).toBe('missing_arguments');
      expect(parsed.next[0].command).toContain('flags entities create <kind>');
    });
  });

  describe('update', () => {
    it('preserves schema edits made while selecting an entity', async () => {
      client.stdin.isTTY = true;
      selectMock.mockImplementationOnce(async () => {
        settings.entities.push({
          kind: 'service',
          label: 'Service',
          attributes: [],
        });
        settings.entities[1].attributes.push({
          key: 'browser',
          type: 'string',
        });
        return 'device';
      });

      expect(await run('update', '--label', ' Client device ')).toBe(0);
      expect(settings.entities.map(entity => entity.kind)).toEqual([
        'user',
        'device',
        'service',
      ]);
      expect(settings.entities[1]).toMatchObject({
        label: 'Client device',
        attributes: [{ key: 'os' }, { key: 'browser' }],
      });
    });

    it('validates additions before scanning references for removals', async () => {
      expect(
        await run(
          'update',
          'user',
          '--add-attribute',
          'plan:string',
          '--remove-attribute',
          'signupAt'
        )
      ).toBe(1);
      expect(
        requestMock.mock.calls.some(([, url]) =>
          /feature-flags\/(flags|segments)/.test(url)
        )
      ).toBe(false);
      const out = stripAnsi(client.stderr.getFullOutput());
      expect(out).toContain(`${chars.fatal} Attribute "plan" already exists`);
      expect(out).not.toContain('Error:');
    });

    it('normalizes labels before checking uniqueness', async () => {
      expect(await run('update', 'device', '--label', ' User ')).toBe(1);
      expect(settings.entities[1].label).toBe('Device');
      expect(client.stderr.getFullOutput()).toContain(
        'Entity label "User" is already used'
      );
    });

    it.each([
      'missing',
      'user',
    ])('preserves all update options in recovery commands for %s', async kind => {
      const label = "User's $(whoami)";
      const payload = await runAgentError(
        'update',
        kind,
        '--label',
        label,
        '--add-attribute',
        'email:string',
        '--remove-attribute',
        'signupAt',
        '--set-attribute-type',
        'plan:number',
        '--project',
        'vercel-flags-test'
      );
      const command = payload.next[1].command;
      expect(command).toContain(
        `flags entities update ${kind === 'missing' ? '<kind>' : kind}`
      );
      expect(command).toContain("--label 'User'\\''s $(whoami)'");
      expect(command).toContain('--add-attribute email:string');
      expect(command).toContain('--remove-attribute signupAt');
      expect(command).toContain('--set-attribute-type plan:number');
      expect(command).toContain('--project vercel-flags-test');
      expect(command).toContain('--non-interactive');
      expect(command).not.toContain('\u001b');
    });
    it('renames an entity and adds an attribute', async () => {
      const exitCode = await run(
        'update',
        'device',
        '--label',
        'Client device',
        '--add-attribute',
        'model:string'
      );

      expect(exitCode).toEqual(0);
      expect(settings.entities[1]).toEqual({
        kind: 'device',
        label: 'Client device',
        attributes: [
          { key: 'os', type: 'string' },
          { key: 'model', type: 'string' },
        ],
      });
      expect(client.stderr.getFullOutput()).toContain(
        'Feature flag entity device updated'
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:entities', value: 'entities' },
        { key: 'subcommand:update', value: 'update' },
        { key: 'argument:kind', value: '[REDACTED]' },
        { key: 'option:label', value: '[REDACTED]' },
        { key: 'option:add-attribute', value: '[REDACTED]' },
      ]);
    });

    it('removes an unused attribute', async () => {
      const exitCode = await run(
        'update',
        'user',
        '--remove-attribute',
        'signupAt',
        '--json'
      );

      expect(exitCode).toEqual(0);
      const parsed = JSON.parse(client.stdout.getFullOutput());
      expect(
        parsed.entity.attributes.map((a: { key: string }) => a.key)
      ).toEqual(['plan', 'userId']);
      expect(settings.entities[0].attributes).toHaveLength(2);
    });

    it('blocks removing an attribute that flags and segments reference', async () => {
      const exitCode = await run(
        'update',
        'user',
        '--remove-attribute',
        'plan'
      );

      expect(exitCode).toEqual(1);
      const out = client.stderr.getFullOutput();
      expect(out).toContain('Attribute user.plan is still in use');
      expect(out).toContain('Used by feature flags: my-feature');
      expect(out).toContain('Used by segments: beta-users');
      expect(out).toContain('flags inspect my-feature');
      expect(settings.entities[0].attributes).toHaveLength(3);
    });

    it('emits structured JSON in non-interactive mode when an attribute is in use', async () => {
      const parsed = await runAgentError(
        'update',
        'user',
        '--set-attribute-type',
        'plan:number'
      );
      expect(parsed.status).toBe('error');
      expect(parsed.reason).toBe('entity_in_use');
      expect(parsed.message).toContain('user.plan');
      expect(parsed.next[0].command).toContain('flags inspect my-feature');
      expect(parsed.next[1].command).toContain(
        'flags entities update user --set-attribute-type plan:number'
      );
      expect(settings.entities[0].attributes[0].type).toBe('string');
    });

    it('changes the type of an unused attribute and drops its labels', async () => {
      settings.entities[0].attributes[2].labels = [
        { value: '1', label: 'One' },
      ];

      const exitCode = await run(
        'update',
        'user',
        '--set-attribute-type',
        'signupAt:number'
      );

      expect(exitCode).toEqual(0);
      expect(settings.entities[0].attributes[2]).toEqual({
        key: 'signupAt',
        type: 'number',
      });
    });

    it('keeps an in-use attribute when the type does not change', async () => {
      const exitCode = await run(
        'update',
        'user',
        '--set-attribute-type',
        'plan:string'
      );

      expect(exitCode).toEqual(0);
      expect(settings.entities[0].attributes[0]).toMatchObject({
        key: 'plan',
        type: 'string',
      });
      expect(settings.entities[0].attributes[0].labels).toHaveLength(2);
    });
  });

  describe('rm', () => {
    it.each([
      true,
      false,
    ])('rejects extra kinds before making requests (TTY: %s)', async isTTY => {
      client.stdin.isTTY = isTTY;
      expect(await run('rm', 'device', 'user', '--yes')).toBe(2);
      expect(client.stderr.getFullOutput()).toContain(
        'Provide only one entity kind to delete.'
      );
      expect(settings.entities).toHaveLength(2);
      expect(requestMock).not.toHaveBeenCalled();
      expect(confirmMock).not.toHaveBeenCalled();
      expect(selectMock).not.toHaveBeenCalled();
    });

    it('reports extra kinds as a structured error', async () => {
      const payload = await runAgentError('rm', 'device', 'user', '--yes');
      expect(payload.reason).toBe('invalid_arguments');
      expect(payload.message).toBe('Provide only one entity kind to delete.');
      expect(requestMock).not.toHaveBeenCalled();
      expect(settings.entities).toHaveLength(2);
    });

    describe.each(['--yes', '-y'])('recovery commands with %s', yesFlag => {
      it.each([
        'missing',
        'flag',
        'segment',
      ])('omits confirmation from human read-only suggestions (%s)', async reference => {
        if (reference === 'segment') projectFlags.splice(0);
        expect(
          await run(
            'rm',
            reference === 'missing' ? 'missing' : 'user',
            yesFlag,
            '--project',
            'vercel-flags-test'
          )
        ).toBe(1);
        const out = stripAnsi(client.stderr.getFullOutput());
        const command =
          reference === 'missing'
            ? 'flags entities ls'
            : reference === 'flag'
              ? 'flags inspect'
              : 'flags segments inspect';
        expect(out).toContain(command);
        expect(out).toContain('--project vercel-flags-test');
        expect(out).not.toMatch(/--yes|\s-y\b/);
      });

      it.each([
        'missing',
        'flag',
        'segment',
      ])('keeps confirmation only on agent deletion retries (%s)', async reference => {
        if (reference === 'segment') projectFlags.splice(0);
        const payload = await runAgentError(
          'rm',
          reference === 'missing' ? 'missing' : 'user',
          yesFlag,
          '--project',
          'vercel-flags-test'
        );
        expect(payload.next[0].command).not.toMatch(/--yes|\s-y\b/);
        expect(payload.next[1].command).toContain('flags entities delete');
        expect(payload.next[1].command).toContain('--yes');
        for (const next of payload.next) {
          expect(next.command).toContain('--project vercel-flags-test');
          expect(next.command).toContain('--non-interactive');
        }
      });
    });

    it('preserves schema edits made while confirming deletion', async () => {
      client.stdin.isTTY = true;
      confirmMock.mockImplementationOnce(async () => {
        settings.entities.push({
          kind: 'service',
          label: 'Service',
          attributes: [],
        });
        return true;
      });

      expect(await run('rm', 'device')).toBe(0);
      expect(settings.entities.map(entity => entity.kind)).toEqual([
        'user',
        'service',
      ]);
    });

    it('blocks references added while confirmation is open', async () => {
      client.stdin.isTTY = true;
      confirmMock.mockImplementationOnce(async () => {
        projectFlags[0].experiment = {
          base: { type: 'entity', kind: 'device', attribute: 'os' },
        };
        return true;
      });

      expect(await run('rm', 'device')).toBe(1);
      expect(settings.entities).toHaveLength(2);
      expect(client.stderr.getFullOutput()).toContain(
        'Used by feature flags: my-feature'
      );
      expect(
        requestMock.mock.calls.some(([method]) => method === 'PATCH')
      ).toBe(false);
    });

    it('refreshes settings after selection even with --yes', async () => {
      client.stdin.isTTY = true;
      selectMock.mockImplementationOnce(async () => {
        settings.entities.push({
          kind: 'service',
          label: 'Service',
          attributes: [],
        });
        return 'device';
      });

      expect(await run('rm', '--yes')).toBe(0);
      expect(settings.entities.map(entity => entity.kind)).toEqual([
        'user',
        'service',
      ]);
      expect(confirmMock).not.toHaveBeenCalled();
    });

    it.each([
      'active',
      'archived',
    ] as const)('checks every database page for %s references despite a stale search index', async state => {
      projectFlags.splice(
        0,
        projectFlags.length,
        ...Array.from({ length: 101 }, (_, index) => ({
          ...structuredClone(defaultFlags[0]),
          id: `flg_${index}`,
          slug: `feature-${index}`,
          state,
          experiment:
            index === 100
              ? {
                  base: {
                    type: 'entity' as const,
                    kind: 'device',
                    attribute: 'os',
                  },
                }
              : null,
        }))
      );

      expect(await run('rm', 'device', '--yes')).toBe(1);
      expect(settings.entities).toHaveLength(2);
      expect(client.stderr.getFullOutput()).toContain(
        'Used by feature flags: feature-100'
      );
      expect(
        requestMock.mock.calls.some(([, url]) =>
          url.includes(`state=${state}&limit=100&cursor=100`)
        )
      ).toBe(true);
      expect(
        requestMock.mock.calls.some(([, url]) => url.startsWith('/v2/'))
      ).toBe(false);
    });
    it('deletes an unused entity with --yes', async () => {
      const exitCode = await run('rm', 'device', '--yes');

      expect(exitCode).toEqual(0);
      expect(settings.entities.map(entity => entity.kind)).toEqual(['user']);
      expect(client.stderr.getFullOutput()).toContain(
        'Feature flag entity device deleted'
      );
      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        { key: 'subcommand:entities', value: 'entities' },
        { key: 'subcommand:delete', value: 'rm' },
        { key: 'argument:kind', value: '[REDACTED]' },
        { key: 'flag:yes', value: 'TRUE' },
      ]);
    });

    it.each([
      ['delete', false],
      ['del', false],
      ['remove', true],
    ])('runs as %s (deprecated: %s)', async (name, deprecated) => {
      expect(await run(name, 'device', '--yes')).toEqual(0);
      const warning =
        '`vercel flags entities remove` is deprecated. Use `vercel flags entities delete`.';
      if (deprecated) {
        expect(client.stderr.getFullOutput()).toContain(warning);
      } else {
        expect(client.stderr.getFullOutput()).not.toContain('is deprecated');
      }
    });

    it('blocks deleting an entity that flags and segments reference', async () => {
      const exitCode = await run('rm', 'user', '--yes');

      expect(exitCode).toEqual(1);
      const out = client.stderr.getFullOutput();
      expect(out).toContain('Entity user is still in use');
      expect(out).toContain('Used by feature flags: my-feature');
      expect(out).toContain('Used by segments: beta-users, staff');
      expect(settings.entities).toHaveLength(2);
    });

    it('requires --yes when stdin is not a TTY', async () => {
      const exitCode = await run('rm', 'device');

      expect(exitCode).toEqual(1);
      expect(client.stderr.getFullOutput()).toContain(
        'Missing required option --yes'
      );
      expect(settings.entities).toHaveLength(2);
      expect(requestMock).not.toHaveBeenCalled();
    });

    it('asks for confirmation in a TTY and aborts on no', async () => {
      client.stdin.isTTY = true;
      confirmMock.mockResolvedValue(false);

      const exitCode = await run('rm', 'device');

      expect(exitCode).toEqual(0);
      expect(confirmMock).toHaveBeenCalledWith(
        expect.stringContaining('Delete entity device and its 1 attribute?'),
        false
      );
      expect(client.stderr.getFullOutput()).toContain('Aborted');
      expect(settings.entities).toHaveLength(2);
      expect(confirmMock.mock.calls[0][0]).not.toMatch(
        /Are you sure|1 attributes/
      );
      expect(stripAnsi(client.stderr.getFullOutput())).toMatch(
        /Project\s+.*vercel-flags-test/
      );
    });

    it('deletes after confirmation in a TTY', async () => {
      client.stdin.isTTY = true;
      confirmMock.mockResolvedValue(true);

      const exitCode = await run('rm', 'device');

      expect(exitCode).toEqual(0);
      expect(settings.entities).toHaveLength(1);
    });

    it.each([
      true,
      false,
    ])('emits structured JSON when confirmation is missing (TTY: %s)', async isTTY => {
      client.stdin.isTTY = isTTY;
      const parsed = await runAgentError('rm', 'device');
      expect(parsed.status).toBe('error');
      expect(parsed.reason).toBe('confirmation_required');
      expect(parsed.next[0].command).toContain(
        'flags entities delete device --yes'
      );
      expect(settings.entities).toHaveLength(2);
      expect(confirmMock).not.toHaveBeenCalled();
      expect(requestMock).not.toHaveBeenCalled();
      expect(parsed.message).toBe('Add --yes to delete entity device.');
    });
  });
});
