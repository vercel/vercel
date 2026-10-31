import { describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import { help } from '../../src/args';
import { commandsStructs } from '../../src/commands';
import { getRootHelpCommands } from '../../src/commands/root-help';

describe('base level help output', () => {
  it('help', () => {
    expect(
      stripAnsi(help(getRootHelpCommands(commandsStructs)))
    ).toMatchSnapshot();
  });
});
