import { describe, expect, it, vi } from 'vitest';
import {
  getSchedulesErrorContext,
  isLocalSchedulesCommand,
  isSchedulesCommand,
  parseSchedulesArguments,
} from '../../../../src/util/schedules/local-mode';

vi.mock('../../../../src/util/pkg', () => ({ default: { name: 'vercel' } }));

const argv = (...args: string[]) => ['node', 'cli.js', ...args];

describe('isLocalSchedulesCommand', () => {
  it.each([
    ['schedules', '--local'],
    ['schedules', '-L', 'list'],
    ['--local', 'schedules', 'list'],
    ['schedules', 'list', '--local'],
    ['schedules', 'ls', '-L'],
    ['schedules', 'inspect', 'cleanup', '-L'],
    ['schedules', 'get', 'cleanup', '-L'],
    [
      'schedules',
      'create',
      'cleanup',
      '--cron',
      '* * * * *',
      '--topic',
      'jobs',
      '-L',
    ],
    ['schedules', 'update', 'cleanup', '--jitter', 'none', '--local'],
    ['schedules', 'delete', 'cleanup', '--local', '--yes'],
    ['schedules', 'rm', 'cleanup', '-Ly'],
    ['schedules', 'enable', 'cleanup', '-L'],
    ['schedules', 'disable', 'cleanup', '-L'],
    ['schedules', 'invoke', 'cleanup', '-L'],
    ['schedules', 'executions', 'list', 'cleanup', '--local'],
    ['schedules', '--local', 'executions', 'ls', 'cleanup'],
    ['--cwd', '/tmp/project', 'schedules', 'list', '-L', '--namespace', 'jobs'],
    ['schedules', 'list', '--namespace=--local', '--local'],
    ['schedules', 'list', '--local', '--namespace=--scope=team'],
    ['schedules', 'get', '--local', '--', 'cleanup'],
    ['help', 'schedules', '--local'],
    ['schedules', 'list', '--local', '--token', 'explicit'],
    ['schedules', 'list', '--local', '-S', 'team'],
  ])('recognizes local schedules: %j', (...args) => {
    expect(isLocalSchedulesCommand(argv(...args))).toBe(true);
  });

  it.each([
    [],
    ['schedules', 'list'],
    ['dev', '--local'],
    ['deploy', '--local'],
    ['other', 'schedules', '--local'],
    ['schedules', 'list', '--namespace=--local'],
    ['schedules', 'list', '--namespace=-L'],
    ['schedules', 'list', '--next=--local'],
    ['schedules', 'create', 'cleanup', '--payload=--local'],
    ['schedules', 'create', 'cleanup', '--payload', '{"flag":"--local"}'],
    ['schedules', 'get', '--', '--local'],
    ['schedules', 'get', '--', '-L'],
    ['--', 'schedules', 'list', '--local'],
    ['schedules', 'list', '--namespace', '--local'],
    ['schedules', 'list', '--local', '--namespace'],
    ['schedules', 'list', '--local', '--unknown'],
    ['schedules', 'list', '--local', '-S'],
    ['schedules', 'list', '--local', '-Fjson'],
  ])('does not infer local mode from values or malformed argv: %j', (...args) => {
    expect(isLocalSchedulesCommand(argv(...args))).toBe(false);
  });

  it('does not mutate the supplied argv', () => {
    const args = argv('schedules', 'list', '--local');
    const original = [...args];
    isLocalSchedulesCommand(args);
    expect(args).toEqual(original);
  });

  it('does not interpret executable or script names as options', () => {
    expect(
      isLocalSchedulesCommand(['node', '--local', 'schedules', 'list'])
    ).toBe(false);
    expect(isLocalSchedulesCommand(['-L', 'cli.js', 'schedules', 'list'])).toBe(
      false
    );
  });
});

describe('getSchedulesErrorContext', () => {
  it.each([
    {
      args: ['--unknown', '--non-interactive'],
      local: false,
      nonInteractive: true,
    },
    {
      args: ['--local', '--unknown', '--non-interactive'],
      local: true,
      nonInteractive: true,
    },
    {
      args: ['--namespace', '-L', '--non-interactive'],
      local: true,
      nonInteractive: true,
    },
    {
      args: ['--non-interactive', '--namespace'],
      local: false,
      nonInteractive: true,
    },
    {
      args: ['--unknown', '--non-interactive=false'],
      local: false,
      nonInteractive: false,
    },
    {
      args: ['--unknown', '--non-interactive', 'false'],
      local: false,
      nonInteractive: false,
    },
    {
      args: ['--non-interactive=false', '--non-interactive'],
      local: false,
      nonInteractive: false,
    },
    {
      args: ['--namespace=--local', '--non-interactive'],
      local: false,
      nonInteractive: true,
    },
    {
      args: ['--namespace=--non-interactive=false', '--non-interactive'],
      local: false,
      nonInteractive: true,
    },
    {
      args: ['--namespace=--non-interactive'],
      local: false,
      nonInteractive: undefined,
    },
    {
      args: ['--payload', '{"flag":"--non-interactive"}'],
      local: false,
      nonInteractive: undefined,
    },
    { args: ['--unknown=--local'], local: false, nonInteractive: undefined },
    {
      args: ['--unknown', '--', '--local', '--non-interactive'],
      local: false,
      nonInteractive: undefined,
    },
    {
      args: ['--non-interactive', '-L', '--', '--non-interactive=false'],
      local: true,
      nonInteractive: true,
    },
    {
      args: ['--non-interactive', '--token', 'false'],
      local: false,
      nonInteractive: true,
    },
    { args: ['-dL', '--limit', '-1'], local: true, nonInteractive: undefined },
    { args: ['-tL'], local: false, nonInteractive: undefined },
    { args: ['-F', 'json', '-L'], local: true, nonInteractive: undefined },
    {
      args: ['--local', '--token=--non-interactive=false'],
      local: true,
      nonInteractive: undefined,
    },
    {
      args: ['-L', '--scope=--non-interactive', '--non-interactive=false'],
      local: true,
      nonInteractive: false,
    },
    {
      args: ['-L', '--team=--non-interactive=false', '--non-interactive'],
      local: true,
      nonInteractive: true,
    },
  ])('recovers only actual flags from $args', ({ args, ...context }) => {
    expect(
      getSchedulesErrorContext(argv('schedules', 'list', ...args))
    ).toEqual(context);
  });
});

describe('parseSchedulesArguments', () => {
  it('normalizes explicit cloud selectors for bootstrap rejection', () => {
    const { flags } = parseSchedulesArguments(
      argv(
        'schedules',
        'list',
        '-L',
        '-t',
        'secret',
        '-S',
        'scope',
        '-T',
        'team'
      )
    );
    expect(flags).toMatchObject({
      '--local': true,
      '--token': 'secret',
      '--scope': 'scope',
      '--team': 'team',
    });
  });

  it('keeps selector-shaped string values out of the global flags', () => {
    const { flags } = parseSchedulesArguments(
      argv('schedules', 'list', '--local', '--namespace=--scope=team')
    );
    expect(flags).toMatchObject({ '--namespace': '--scope=team' });
    expect(flags['--scope']).toBeUndefined();
  });
});

describe('isSchedulesCommand', () => {
  it.each([
    ['schedules', 'list', '--local', '--unknown'],
    ['schedules', 'list', '--unknown', '--local'],
    ['--local', 'schedules', 'list', '--unknown'],
    ['schedules', 'list', '--local', '--namespace'],
    ['schedules', 'list', '--namespace', '--local'],
    ['-L', 'schedules', 'list', '--namespace'],
    ['--cwd', '/tmp/project', 'schedules', 'list', '--unknown'],
    ['schedules', 'list', '--unknown'],
    ['schedules', 'list', '--namespace'],
    ['help', 'schedules', '--unknown'],
  ])('identifies schedules before malformed options: %j', (...args) => {
    expect(isSchedulesCommand(argv(...args))).toBe(true);
    expect(() => parseSchedulesArguments(argv(...args))).toThrow();
  });

  it.each([
    ['dev', '--local', '--unknown'],
    ['deploy', '--namespace', 'schedules', '--local'],
    ['--cwd', 'schedules', 'dev', '--local'],
    ['--namespace=schedules', 'dev', '--local'],
    ['help', 'dev', '--local'],
    ['other', 'schedules', '--local'],
  ])('does not treat option values or other commands as schedules: %j', (...args) => {
    expect(isSchedulesCommand(argv(...args))).toBe(false);
  });
});
