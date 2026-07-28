import { describe, expect, test } from 'vitest';
import type { CliCommand } from '../load-command-model.js';
import { normalizeCommandTree } from '../load-command-model.js';
import type { GeneratedManifest } from '../types.js';
import { firstSentence, renderIndex } from '../render-markdown.js';
import { fixtureRoot } from './fixtures.js';

function manifestFrom(roots: CliCommand[]): GeneratedManifest {
  return {
    commands: normalizeCommandTree(roots),
    globalOptions: [
      {
        name: 'debug',
        shorthand: 'd',
        argument: null,
        type: 'boolean',
        description: 'Debug mode',
        deprecated: false,
        undocumented: false,
      },
    ],
  };
}

describe('renderIndex', () => {
  const index = renderIndex(manifestFrom([fixtureRoot]));

  test('lists root families with aliases, without per-family links', () => {
    expect(index).toContain('| `demo` | `d` |');
    expect(index).not.toContain('](./');
  });

  test('does not enumerate subcommand syntax (help is the authority)', () => {
    expect(index).not.toContain('demo list');
    expect(index).not.toContain('--tag');
    expect(index).toContain('run `vercel <command> --help`');
  });

  test('excludes hidden commands', () => {
    expect(index).not.toContain('secret');
  });

  test('renders global options', () => {
    expect(index).toContain('- `-d`, `--debug` (boolean) — Debug mode');
  });
});

describe('firstSentence', () => {
  test('truncates multi-sentence descriptions with a marker', () => {
    expect(
      firstSentence('Deploy your project to Vercel. The deploy command is …')
    ).toBe('Deploy your project to Vercel. …');
  });

  test('returns single-sentence descriptions unchanged', () => {
    expect(firstSentence('List deployments.')).toBe('List deployments.');
    expect(firstSentence('No trailing period')).toBe('No trailing period');
  });

  test('collapses newlines', () => {
    expect(firstSentence('First line\nsecond line.')).toBe(
      'First line second line.'
    );
  });
});
