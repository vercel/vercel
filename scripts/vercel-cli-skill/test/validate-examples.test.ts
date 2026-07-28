import { describe, expect, test } from 'vitest';
import {
  buildAliasResolver,
  normalizeCommandTree,
} from '../load-command-model.js';
import {
  extractExamplesFromMarkdown,
  validateExample,
} from '../validate-examples.js';
import { fixtureRoot } from './fixtures.js';
import type { GeneratedManifest } from '../types.js';

function manifestFromFixture(): {
  manifest: GeneratedManifest;
  resolve: ReturnType<typeof buildAliasResolver>;
  byPath: Map<string, ReturnType<typeof normalizeCommandTree>[number]>;
} {
  const commands = normalizeCommandTree([fixtureRoot]);
  // Pretend deploy exists for flag-only root invocations in other tests.
  const deploy = {
    path: ['deploy'],
    canonicalPath: 'deploy',
    name: 'deploy',
    aliases: [],
    description: 'Deploy',
    hidden: false,
    default: false,
    arguments: [],
    options: [
      {
        name: 'prod',
        shorthand: null,
        argument: null,
        type: 'boolean' as const,
        description: 'Production',
        deprecated: false,
        undocumented: false,
      },
    ],
    disabledGlobalOptions: [],
    subcommands: [],
  };
  const all = [...commands, deploy];
  const manifest: GeneratedManifest = {
    commands: all,
    globalOptions: [
      {
        name: 'help',
        shorthand: 'h',
        argument: null,
        type: 'boolean',
        description: 'Help',
        deprecated: false,
        undocumented: false,
      },
      {
        name: 'cwd',
        shorthand: null,
        argument: 'DIR',
        type: 'string',
        description: 'cwd',
        deprecated: false,
        undocumented: false,
      },
    ],
  };
  return {
    manifest,
    resolve: buildAliasResolver(all),
    byPath: new Map(all.map(c => [c.canonicalPath, c])),
  };
}

describe('extractExamplesFromMarkdown', () => {
  test('extracts fenced, multiline, vc alias, substitutions, and inline spans', () => {
    const md = `
# Demo

\`\`\`bash
vercel demo ls --tag a
vc demo add rule
vercel demo add name -- \\
  --forwarded-to-other
echo $(vercel demo ls)
\`\`\`

See \`vercel demo --json\` and \`vc -h\`.
`;
    const examples = extractExamplesFromMarkdown('demo.md', md);
    const raws = examples.map(e => e.raw);
    expect(raws).toContain('vercel demo ls --tag a');
    expect(raws).toContain('vc demo add rule');
    const forwarded = examples.find(e =>
      e.raw.includes('--forwarded-to-other')
    );
    expect(forwarded?.tokens.join(' ')).toBe('demo add name');
    expect(raws).toContain('vercel demo ls');
    expect(raws).toContain('vercel demo --json');
    expect(raws).toContain('vc -h');
  });

  test('extracts commands behind leading env assignments', () => {
    const md = [
      '```bash',
      'BLOB_READ_WRITE_TOKEN=xxx vercel demo ls',
      'A=1 B="two words" vc demo add rule',
      '```',
    ].join('\n');
    const raws = extractExamplesFromMarkdown('demo.md', md).map(e => e.raw);
    expect(raws).toContain('vercel demo ls');
    expect(raws).toContain('vc demo add rule');
  });

  test('keeps quoted flag values with spaces as one token', () => {
    const md = ['```bash', 'vercel demo ls --tag="a b" --json', '```'].join(
      '\n'
    );
    const [example] = extractExamplesFromMarkdown('demo.md', md);
    expect(example.tokens).toEqual(['demo', 'ls', '--tag=a b', '--json']);
  });

  test('does not treat # inside single quotes as a comment', () => {
    const md = [
      '```bash',
      "vercel demo ls --tag 'build #42' --json",
      '```',
    ].join('\n');
    const [example] = extractExamplesFromMarkdown('demo.md', md);
    expect(example.tokens).toEqual([
      'demo',
      'ls',
      '--tag',
      'build #42',
      '--json',
    ]);
  });
});

describe('validateExample', () => {
  test('accepts aliases, repeated options, global flags, and -- forwarding', () => {
    const { manifest, resolve, byPath } = manifestFromFixture();

    const valued = {
      long: new Set(['tag', 'cwd']),
      short: new Set<string>(),
    };

    expect(
      validateExample(
        {
          file: 'x.md',
          line: 1,
          raw: 'vercel d ls --tag a --tag b',
          tokens: ['d', 'ls', '--tag', 'a', '--tag', 'b'],
        },
        manifest,
        resolve,
        byPath,
        valued
      )
    ).toBeNull();

    expect(
      validateExample(
        {
          file: 'x.md',
          line: 1,
          raw: 'vc demo --cwd /tmp --json',
          tokens: ['demo', '--cwd', '/tmp', '--json'],
        },
        manifest,
        resolve,
        byPath,
        valued
      )
    ).toBeNull();
  });

  test('fails unknown commands, unknown options, and deprecated options', () => {
    const { manifest, resolve, byPath } = manifestFromFixture();
    const valued = {
      long: new Set(['tag', 'cwd']),
      short: new Set<string>(),
    };

    const unknown = validateExample(
      {
        file: 'x.md',
        line: 1,
        raw: 'vercel nope',
        tokens: ['nope'],
      },
      manifest,
      resolve,
      byPath,
      valued
    );
    expect(unknown?.message).toMatch(/Unknown command/);

    const badFlag = validateExample(
      {
        file: 'x.md',
        line: 1,
        raw: 'vercel demo --nope',
        tokens: ['demo', '--nope'],
      },
      manifest,
      resolve,
      byPath,
      valued
    );
    expect(badFlag?.message).toMatch(/Unknown option --nope/);

    const deprecated = validateExample(
      {
        file: 'x.md',
        line: 1,
        raw: 'vercel demo --legacy',
        tokens: ['demo', '--legacy'],
      },
      manifest,
      resolve,
      byPath,
      valued
    );
    expect(deprecated?.message).toMatch(/Deprecated option/);

    const badSub = validateExample(
      {
        file: 'x.md',
        line: 1,
        raw: 'vercel demo missing',
        tokens: ['demo', 'missing'],
      },
      manifest,
      resolve,
      byPath,
      valued
    );
    expect(badSub?.attemptedPath).toBe('demo missing');
    expect(badSub?.message).toMatch(/Unknown subcommand/);
  });

  test('rejects global options a command disables', () => {
    const { manifest, resolve, byPath } = manifestFromFixture();
    const valued = {
      long: new Set(['tag', 'cwd']),
      short: new Set<string>(),
    };

    // fixture `demo list` sets disabledGlobalOptions: ['cwd'].
    const disabled = validateExample(
      {
        file: 'x.md',
        line: 1,
        raw: 'vercel demo ls --cwd /tmp',
        tokens: ['demo', 'ls', '--cwd', '/tmp'],
      },
      manifest,
      resolve,
      byPath,
      valued
    );
    expect(disabled?.message).toMatch(/Unknown option --cwd/);

    // Other global options remain valid on the same command.
    expect(
      validateExample(
        {
          file: 'x.md',
          line: 1,
          raw: 'vercel demo ls --help',
          tokens: ['demo', 'ls', '--help'],
        },
        manifest,
        resolve,
        byPath,
        valued
      )
    ).toBeNull();
  });
});
