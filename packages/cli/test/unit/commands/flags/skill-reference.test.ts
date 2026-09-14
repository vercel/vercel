import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { flagsCommand } from '../../../../src/commands/flags/command';

const referencePath = join(
  __dirname,
  '../../../../../../skills/vercel-cli/references/flags.md'
);

describe('flags skill reference', () => {
  const reference = readFileSync(referencePath, 'utf8');
  const listed = new Set(
    [...reference.matchAll(/^vercel flags ([a-z-]+)/gm)].map(m => m[1])
  );
  const publicSubcommands = flagsCommand.subcommands.filter(
    subcommand => !('hidden' in subcommand && subcommand.hidden)
  );

  it.each(
    publicSubcommands.map(s => [s.name, s] as const)
  )('lists `vercel flags %s`', (name, subcommand) => {
    const names = [name, ...subcommand.aliases];
    expect(names.some(n => listed.has(n))).toBe(true);
  });

  it('lists no subcommands that the CLI does not have', () => {
    const known = new Set(
      publicSubcommands.flatMap(s => [s.name, ...s.aliases])
    );
    for (const name of listed) {
      expect(known).toContain(name);
    }
  });
});
