import { describe, expect, it } from 'vitest';
import { help } from '../../../src/commands/help';
import { storageCommand } from '../../../src/commands/storage/command';
import { flagsCommand } from '../../../src/commands/flags/command';
import { firewallCommand } from '../../../src/commands/firewall/command';
import { setupCommand } from '../../../src/commands/setup/command';

// Command discovery belongs to rendered help, not a duplicated skill catalog.
for (const command of [
  storageCommand,
  flagsCommand,
  firewallCommand,
  setupCommand,
]) {
  describe(`${command.name} help discovery`, () => {
    const rendered = help(command, { stream: { isTTY: false }, columns: 120 });
    const publicSubcommands = command.subcommands.filter(
      subcommand => !('hidden' in subcommand && subcommand.hidden)
    );

    it.each(
      publicSubcommands.map(subcommand => [subcommand.name] as const)
    )('exposes the %s subcommand', name => {
      expect(rendered).toMatch(new RegExp(`\\b${name}\\b`));
    });
  });
}

describe('setup help discovery', () => {
  const rendered = help(setupCommand, {
    stream: { isTTY: false },
    columns: 120,
  });

  it.each(
    setupCommand.options
      .filter(option => !option.deprecated)
      .map(option => [option.name] as const)
  )('exposes the --%s option', name => {
    expect(rendered).toContain(`--${name}`);
  });

  // `--plugin` and `--gateway` still work but point to the step subcommands.
  it.each(
    setupCommand.options
      .filter(option => option.deprecated)
      .map(option => [option.name] as const)
  )('hides the deprecated --%s option', name => {
    expect(rendered).not.toContain(`--${name}`);
  });
});
