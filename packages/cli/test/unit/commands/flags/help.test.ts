import { describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import { help } from '../../../../src/commands/help';
import {
  archiveSubcommand,
  disableSubcommand,
  enableSubcommand,
  flagsCommand,
} from '../../../../src/commands/flags/command';

describe('flags lifecycle help', () => {
  it('shows the archive message option and example', () => {
    const text = stripAnsi(
      help(archiveSubcommand, {
        stream: { isTTY: false },
        parent: flagsCommand,
        columns: 80,
      })
    ).replace(/\s+/g, ' ');

    expect(text).toContain('--message <TEXT>');
    expect(text).toContain('Attach a revision message when archiving the flag');
    expect(text).toContain(
      'vercel flags archive my-feature-flag --message "Removed from code"'
    );
  });

  it.each([
    enableSubcommand,
    disableSubcommand,
  ])('explains that $name preserves targeting', command => {
    const text = stripAnsi(
      help(command, {
        stream: { isTTY: false },
        parent: flagsCommand,
        columns: 80,
      })
    ).replace(/\s+/g, ' ');

    expect(text).toContain(
      'Existing splits, rollouts, rules, and targets are kept but not evaluated.'
    );
    expect(text).toContain('flags targeting enable <flag>');
    expect(text).not.toContain('use-targeting');
    expect(text).not.toContain('replaces its default split or rollout');
  });
});
