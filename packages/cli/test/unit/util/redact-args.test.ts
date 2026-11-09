import { describe, expect, it } from 'vitest';
import { stripSensitiveAuthArgs } from '../../../src/util/redact-args';
import { buildCommandWithYes } from '../../../src/util/agent-output';
import { getNextPageCommand } from '../../../src/util/pagination';
import getCommandFlags from '../../../src/util/get-command-flags';

describe('stripSensitiveAuthArgs', () => {
  it('drops SDK keys and values attached to --sdk-key', () => {
    expect(
      stripSensitiveAuthArgs([
        'flags',
        'datafile',
        '--sdk-key=vf_server_secret1',
        '--sdk-key',
        'vf_client_secret2',
        '--json',
      ])
    ).toEqual(['flags', 'datafile', '--sdk-key', '--json']);
  });

  it('drops --token and -t with their values in every spelling', () => {
    expect(
      stripSensitiveAuthArgs([
        'ls',
        '--token',
        'secret1',
        '--token=secret2',
        '-t',
        'secret3',
        '-t=secret4',
      ])
    ).toEqual(['ls']);
  });

  it('drops a token passed inside a group of short flags and keeps the rest', () => {
    expect(stripSensitiveAuthArgs(['vcr', 'ls', '-dt', 'secret'])).toEqual([
      'vcr',
      'ls',
      '-d',
    ]);
    expect(stripSensitiveAuthArgs(['ls', '-dyt', 'secret', '--json'])).toEqual([
      'ls',
      '-dy',
      '--json',
    ]);
  });

  it('drops the token after a group the parser would reject', () => {
    expect(stripSensitiveAuthArgs(['ls', '-td', 'secret'])).toEqual([
      'ls',
      '-d',
    ]);
  });

  it('keeps a group after -- as it is, since it belongs to the child command', () => {
    expect(
      stripSensitiveAuthArgs(['curl', '/api', '--', '-st', 'http://x'])
    ).toEqual(['curl', '/api', '--', '-st', 'http://x']);
  });

  it('leaves groups without t alone', () => {
    expect(stripSensitiveAuthArgs(['ls', '-dy', 'value'])).toEqual([
      'ls',
      '-dy',
      'value',
    ]);
  });
});

describe('commands built from argv', () => {
  it('never print a grouped -t token in the next-page command', () => {
    const command = getNextPageCommand(
      ['node', 'vercel', 'vcr', 'ls', '-dt', 'secret'],
      'c2'
    );
    expect(command).toBe('vercel vcr ls -d --next=c2');
    expect(command).not.toContain('secret');
  });

  it('never print a grouped -t token in the --yes command', () => {
    const command = buildCommandWithYes([
      'node',
      'vercel',
      'project',
      'rm',
      'acme-web',
      '-dt',
      'secret',
    ]);
    expect(command).toBe('vercel project rm acme-web -d --yes');
  });
});

describe('getCommandFlags', () => {
  it('never includes --token in a suggested command', () => {
    expect(
      getCommandFlags({ '--limit': 1, '--token': 'secret', '--debug': true })
    ).toBe(' --limit 1 --debug');
  });
});
