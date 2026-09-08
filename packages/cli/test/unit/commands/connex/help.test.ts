import { beforeEach, describe, expect, it } from 'vitest';
import connect from '../../../../src/commands/connex';
import { help } from '../../../../src/commands/help';
import {
  connexCommand,
  createSubcommand,
} from '../../../../src/commands/connex/command';
import { client } from '../../../mocks/client';

const DOCS_URL = 'https://vercel.com/kb/guide/vercel-connect';

describe('connect --help', () => {
  beforeEach(() => {
    client.reset();
  });

  it('links to the Vercel Connect guide', () => {
    const output = help(connexCommand, { columns: 80 });

    expect(output).toContain('Vercel Connect guide:');
    expect(output).toContain(DOCS_URL);
  });

  it('links to the guide from every subcommand', () => {
    for (const subcommand of connexCommand.subcommands) {
      const output = help(subcommand, { columns: 80, parent: connexCommand });

      expect(output, `${subcommand.name} help`).toContain(DOCS_URL);
    }
  });

  it('links to the guide through subcommand routing', async () => {
    client.setArgv('connect', 'list', '--help');

    expect(await connect(client)).toBe(0);
    expect(client.stderr.getFullOutput()).toContain(DOCS_URL);
  });

  it('omits the guide when no documentation is in scope', () => {
    const output = help(createSubcommand, { columns: 80 });

    expect(output).not.toContain('Vercel Connect guide:');
  });
});
