import { describe, expect, it, vi } from 'vitest';
import { complete } from '../../../../src/util/completion/complete';
import type { CompletionCommand } from '../../../../src/util/completion/complete';
import type {
  CommandOption,
  CompletionSource,
} from '../../../../src/commands/help';

const globalOptions: CommandOption[] = [
  { name: 'help', shorthand: 'h', type: Boolean, deprecated: false },
  {
    name: 'scope',
    shorthand: 'S',
    type: String,
    deprecated: false,
    completion: 'team',
  },
  { name: 'legacy', shorthand: null, type: Boolean, deprecated: true },
];

const commands: CompletionCommand[] = [
  {
    name: 'teams',
    aliases: ['team'],
    options: [],
    arguments: [],
    subcommands: [
      {
        name: 'switch',
        aliases: ['change'],
        options: [],
        arguments: [{ name: 'name', required: false, completion: 'team' }],
      },
      { name: 'list', aliases: ['ls'], options: [], arguments: [] },
    ],
  },
  {
    name: 'completion',
    aliases: [],
    options: [],
    arguments: [
      { name: 'shell', required: true, values: ['bash', 'zsh', 'fish'] },
    ],
    subcommands: [
      {
        name: 'install',
        aliases: [],
        options: [],
        arguments: [
          { name: 'shell', required: false, values: ['bash', 'zsh', 'fish'] },
        ],
      },
      {
        name: '__complete',
        hidden: true,
        aliases: [],
        options: [],
        arguments: [],
      },
    ],
  },
  {
    name: 'deploy',
    aliases: [],
    options: [
      { name: 'prod', shorthand: null, type: Boolean, deprecated: false },
    ],
    arguments: [{ name: 'path', required: false }],
  },
];

function run(
  words: string[],
  resolveSource?: (s: CompletionSource) => Promise<string[]>
) {
  return complete(words, { commands, globalOptions, resolveSource });
}

const teamSource = vi.fn(
  async (): Promise<string[]> => ['acme', 'jsvana', 'vercel']
);

describe('completion engine', () => {
  it('completes top-level command names by prefix', async () => {
    expect(await run(['te'])).toEqual(['teams']);
    expect(await run(['c'])).toEqual(['completion']);
    expect(await run([''])).toEqual(['completion', 'deploy', 'teams']);
  });

  it('completes subcommand names', async () => {
    expect(await run(['teams', ''])).toEqual(['list', 'switch']);
    expect(await run(['teams', 's'])).toEqual(['switch']);
  });

  it('resolves aliases when walking the tree', async () => {
    // `team` is an alias of `teams`; still descends to subcommands.
    expect(await run(['team', ''])).toEqual(['list', 'switch']);
  });

  it('completes long flags and excludes deprecated ones', async () => {
    const out = await run(['deploy', '--']);
    expect(out).toContain('--prod');
    expect(out).toContain('--scope');
    expect(out).not.toContain('--legacy');
  });

  it('offers short and long flags for a lone dash', async () => {
    const out = await run(['deploy', '-']);
    expect(out).toContain('-S');
    expect(out).toContain('--scope');
  });

  it('completes static argument values', async () => {
    expect(await run(['completion', 'z'])).toEqual(['zsh']);
    // Nested subcommand positional values: `completion install <TAB>`.
    expect(await run(['completion', 'install', ''])).toEqual([
      'bash',
      'fish',
      'zsh',
    ]);
  });

  it('resolves a dynamic positional via the source', async () => {
    expect(await run(['teams', 'switch', ''], teamSource)).toEqual([
      'acme',
      'jsvana',
      'vercel',
    ]);
    expect(await run(['teams', 'switch', 'v'], teamSource)).toEqual(['vercel']);
  });

  it('resolves a dynamic option value (space-separated)', async () => {
    expect(await run(['deploy', '--scope', ''], teamSource)).toEqual([
      'acme',
      'jsvana',
      'vercel',
    ]);
    expect(await run(['deploy', '--scope', 'a'], teamSource)).toEqual(['acme']);
  });

  it('resolves a dynamic option value (=-joined)', async () => {
    expect(await run(['deploy', '--scope=j'], teamSource)).toEqual([
      '--scope=jsvana',
    ]);
  });

  it('merges visible subcommands with positional values and hides hidden ones', async () => {
    // `completion` has a visible `install` subcommand, a hidden `__complete`
    // subcommand, and a `shell` positional; the first slot offers install + shells.
    const out = await run(['completion', '']);
    expect(out).not.toContain('__complete');
    expect(out).toEqual(['bash', 'fish', 'install', 'zsh']);
  });

  it('yields nothing for a dynamic slot when no resolver is provided', async () => {
    expect(await run(['teams', 'switch', ''])).toEqual([]);
  });

  it('skips option values when counting positionals', async () => {
    // `--scope acme` is an option+value, so `switch` remains the positional.
    expect(await run(['teams', '--scope', 'acme', ''])).toEqual([
      'list',
      'switch',
    ]);
  });
});
