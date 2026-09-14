import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { firewallCommand } from '../../../../src/commands/firewall/command';

const referencePath = join(
  __dirname,
  '../../../../../../skills/vercel-cli/references/firewall.md'
);

/**
 * The reference is what an agent reads to find out the command exists, so a
 * subcommand missing from it is invisible however well it works. Mirrors the
 * same guard on `vercel flags`.
 */
describe('firewall skill reference', () => {
  const reference = readFileSync(referencePath, 'utf8');
  const listed = new Set(
    [...reference.matchAll(/^vercel firewall ([a-z-]+)/gm)].map(m => m[1])
  );
  const publicSubcommands = firewallCommand.subcommands.filter(
    subcommand => !('hidden' in subcommand && subcommand.hidden)
  );

  it.each(
    publicSubcommands.map(s => [s.name, s] as const)
  )('lists `vercel firewall %s`', (name, subcommand) => {
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
