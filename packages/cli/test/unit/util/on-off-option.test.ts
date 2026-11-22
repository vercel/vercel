import { beforeEach, describe, expect, it } from 'vitest';
import type { CommandOption } from '../../../src/commands/help';
import {
  getFalseValueWarnings,
  readOnOffOption,
  rewriteLegacyOnOffValues,
} from '../../../src/util/on-off-option';
import { client } from '../../mocks/client';

describe('readOnOffOption', () => {
  const names = {
    on: '--enable',
    off: '--no-enable',
    oldOn: '--enabled',
    oldOff: '--disabled',
  } as const;

  beforeEach(() => {
    client.setArgv('firewall', 'rules', 'update', 'my-rule');
  });

  it.each([
    [{ '--enable': true }, true],
    [{ '--no-enable': true }, false],
    [{}, undefined],
  ])('reads %j as %s without a warning', (flags, value) => {
    expect(readOnOffOption(client, flags, names)).toEqual({ value });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it.each([
    [{ '--enabled': true }, true, '--enabled is deprecated. Use --enable.'],
    [
      { '--disabled': true },
      false,
      '--disabled is deprecated. Use --no-enable.',
    ],
  ])('reads the old %j as %s, with a warning', (flags, value, warning) => {
    expect(readOnOffOption(client, flags, names)).toEqual({ value });
    expect(client.stderr.getFullOutput()).toContain(warning);
  });

  it('skips the warning with --json', () => {
    client.setArgv('firewall', 'rules', 'update', 'my-rule', '--json');
    expect(readOnOffOption(client, { '--disabled': true }, names)).toEqual({
      value: false,
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it.each([
    [{ '--enable': true, '--no-enable': true }, '--enable', '--no-enable'],
    [{ '--enabled': true, '--disabled': true }, '--enabled', '--disabled'],
    [{ '--enable': true, '--disabled': true }, '--enable', '--disabled'],
  ])('rejects %j', (flags, on, off) => {
    expect(readOnOffOption(client, flags, names)).toEqual({
      error: `Can't use ${on} with ${off}.`,
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });
});

describe('rewriteLegacyOnOffValues', () => {
  const options: CommandOption[] = [
    {
      name: 'fluid-compute',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      legacyValues: { on: 'on', off: 'off' },
    },
    {
      name: 'public',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      legacyValues: { on: 'true', off: 'false' },
    },
    { name: 'yes', shorthand: 'y', type: Boolean, deprecated: false },
  ];

  beforeEach(() => {
    client.setArgv('project', 'update');
  });

  it.each([
    [['--fluid-compute', 'on'], ['--fluid-compute'], 'on'],
    [['--fluid-compute', 'off'], ['--no-fluid-compute'], 'off'],
    [['--fluid-compute=on'], ['--fluid-compute'], 'on'],
    [['--fluid-compute=off'], ['--no-fluid-compute'], 'off'],
    [['--public', 'true'], ['--public'], 'true'],
    [['--public', 'false'], ['--no-public'], 'false'],
  ])('rewrites the old %j to %j, with a warning', (args, rewritten, value) => {
    const result = rewriteLegacyOnOffValues(args, options, client);
    expect(result).toEqual({
      args: rewritten,
      legacy: new Map([[args[0].split('=')[0], value]]),
    });
    expect(client.stderr.getFullOutput()).toContain(
      `${args.join(' ')} is deprecated. Use ${rewritten[0]}.`
    );
  });

  it.each([
    [['--fluid-compute=true'], ['--fluid-compute']],
    [['--fluid-compute=false'], ['--no-fluid-compute']],
    [['--public=true'], ['--public']],
    [['--public=false'], ['--no-public']],
  ])('reads the guide form %j without a warning', (args, rewritten) => {
    const result = rewriteLegacyOnOffValues(args, options, client);
    expect(result).toEqual({ args: rewritten, legacy: new Map() });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it.each([
    [
      ['--fluid-compute', 'my-app'],
      ['--fluid-compute', 'my-app'],
    ],
    [
      ['my-app', '--fluid-compute'],
      ['my-app', '--fluid-compute'],
    ],
    [
      ['--fluid-compute', '--yes'],
      ['--fluid-compute', '--yes'],
    ],
    [
      ['--fluid-compute', '--', 'on'],
      ['--fluid-compute', '--', 'on'],
    ],
    [
      ['--', '--fluid-compute', 'on'],
      ['--', '--fluid-compute', 'on'],
    ],
  ])('leaves %j alone', (args, rewritten) => {
    expect(rewriteLegacyOnOffValues(args, options, client)).toEqual({
      args: rewritten,
      legacy: new Map(),
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });

  it.each([
    [['--fluid-compute', 'yes']],
    [['--fluid-compute', 'true']],
    [['--fluid-compute', 'Disabled']],
    [['--fluid-compute=maybe']],
    [['--public', 'off']],
    [['--public=on']],
  ])('rejects the value in %j', args => {
    const name = args[0].split('=')[0];
    expect(rewriteLegacyOnOffValues(args, options, client)).toEqual({
      error: `${name} doesn't take a value. Use ${name} or --no-${name.slice(2)}.`,
    });
  });

  it('rewrites quietly without a client', () => {
    expect(
      rewriteLegacyOnOffValues(['--fluid-compute', 'on'], options)
    ).toEqual({
      args: ['--fluid-compute'],
      legacy: new Map([['--fluid-compute', 'on']]),
    });
    expect(client.stderr.getFullOutput()).toBe('');
  });
});

describe('getFalseValueWarnings', () => {
  const options: CommandOption[] = [
    { name: 'prod', shorthand: null, type: Boolean, deprecated: false },
    { name: 'no-wait', shorthand: null, type: Boolean, deprecated: false },
    { name: 'name', shorthand: null, type: String, deprecated: false },
    {
      name: 'public',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      legacyValues: { on: 'true', off: 'false' },
    },
    {
      name: 'auto-renew',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      rejectsValue: true,
    },
    {
      name: 'non-interactive',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
  ];

  it.each([['--prod=false'], ['--prod=FALSE']])('warns for %s', token => {
    expect(getFalseValueWarnings(['deploy', token], options)).toEqual([
      `${token} turns --prod on. Use --no-prod to turn it off.`,
    ]);
  });

  it('tells a --no- option to leave it out', () => {
    expect(getFalseValueWarnings(['--no-wait=false'], options)).toEqual([
      '--no-wait=false turns --no-wait on. Leave out --no-wait to turn it off.',
    ]);
  });

  it('warns once for a repeated token', () => {
    expect(
      getFalseValueWarnings(['--prod=false', '--prod=false'], options)
    ).toHaveLength(1);
  });

  it.each([
    [['--prod=true']],
    [['--prod']],
    [['--name=false']],
    [['--public=false']],
    [['--auto-renew=false']],
    [['--non-interactive=false']],
    [['--other=false']],
    [['--', '--prod=false']],
  ])('does not warn for %j', args => {
    expect(getFalseValueWarnings(args, options)).toEqual([]);
  });
});
