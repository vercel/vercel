import { describe, expect, it } from 'vitest';
import {
  buildCiCommand,
  ciDisplayText,
  quoteCiCommandArg,
} from '../../../../src/util/ci/output';

// Tokenize controlled test commands without evaluating their shell contents.
function tokens(command: string): string[] {
  const result: string[] = [];
  let token = '';
  let quoted = false;
  let escaped = false;
  for (const char of command) {
    if (escaped) {
      token += char;
      escaped = false;
    } else if (char === '\\' && !quoted) {
      escaped = true;
    } else if (char === "'") {
      quoted = !quoted;
    } else if (char === ' ' && !quoted) {
      result.push(token);
      token = '';
    } else {
      token += char;
    }
  }
  result.push(token);
  return result;
}

describe('CI output', () => {
  it('strips terminal sequences and escapes line and C1 controls', () => {
    expect(ciDisplayText('\u001b[31mred\u001b[0m\n\r\t\u0000\u0085')).toBe(
      'red\\n\\r\\t\\u0000\\u0085'
    );
  });

  it.each([
    "shew/'quoted'-$HOME;#",
    '-leading',
    'İstanbul',
    'two words',
  ])('quotes %j without changing its value', value => {
    expect(tokens(quoteCiCommandArg(value))).toEqual([value]);
  });

  it.each([
    '--team',
    '--scope',
    '-T',
    '-S',
  ])('preserves %s even when remote task text resembles a global flag', teamFlag => {
    const task = 'build --team=fake --scope=wrong --cwd=/wrong';
    const command = buildCiCommand(
      [
        'node',
        'cli.js',
        teamFlag,
        'actual-team',
        '--cwd',
        '/tmp/a b',
        '--non-interactive',
        '--token',
        'private-token',
        'ci',
        'grep',
        'boom',
      ],
      ['ci', 'logs', 'abc123', `--task=${task}`]
    );
    const argv = tokens(command);
    expect(argv).toContain(`--task=${task}`);
    expect(argv[argv.indexOf(teamFlag) + 1]).toBe('actual-team');
    expect(argv[argv.indexOf('--cwd') + 1]).toBe('/tmp/a b');
    expect(argv).toContain('--non-interactive');
    expect(command).not.toContain('private-token');
    expect(argv).not.toContain('--token');
  });

  it.each([
    "web#test 'quoted' $(unsafe); $HOME",
    '-leading --team=fake --cwd=/wrong',
    'two words --non-interactive=false',
  ])('keeps task %j as one literal argument alongside real context', task => {
    const command = buildCiCommand(
      [
        'node',
        'cli.js',
        'ci',
        'inspect',
        'abc123',
        '--cwd=/tmp/a b',
        '--scope=actual-team',
        '--non-interactive=false',
        '--token=private-token',
      ],
      ['ci', 'logs', 'abc123', `--task=${task}`, '--attempt', '2']
    );
    expect(tokens(command)).toEqual([
      'vercel',
      'ci',
      'logs',
      'abc123',
      `--task=${task}`,
      '--attempt',
      '2',
      '--cwd=/tmp/a b',
      '--scope=actual-team',
      '--non-interactive=false',
    ]);
    expect(command).not.toContain('private-token');
  });

  it('preserves equals-form global context and strips shorthand credentials', () => {
    expect(
      tokens(
        buildCiCommand(
          ['node', 'cli.js', '--team=acme', '--cwd=/tmp/a b', '-t=secret'],
          ['ci', 'inspect', 'abc123']
        )
      )
    ).toEqual([
      'vercel',
      'ci',
      'inspect',
      'abc123',
      '--team=acme',
      '--cwd=/tmp/a b',
    ]);
  });
});
