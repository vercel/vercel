import { describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import { help } from '../../../../src/commands/help';
import {
  ciCommand,
  disableSubcommand,
} from '../../../../src/commands/ci/command';

describe('ci help', () => {
  it.each([40, 80, 120])('lists disable at %s columns', columns => {
    expect(
      stripAnsi(help(ciCommand, { stream: { isTTY: false }, columns }))
    ).toMatchSnapshot();
  });

  it.each([40, 80, 120])('documents disable at %s columns', columns => {
    expect(
      stripAnsi(
        help(disableSubcommand, {
          parent: ciCommand,
          stream: { isTTY: false },
          columns,
        })
      )
    ).toMatchSnapshot();
  });
});
