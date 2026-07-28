import type { CliCommand } from '../load-command-model.js';

/** Nested family used by unit tests (not loaded from the real CLI). */
export const fixtureRoot: CliCommand = {
  name: 'demo',
  aliases: ['d'],
  description: 'Demo family',
  arguments: [],
  options: [
    {
      name: 'json',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'JSON output',
    },
    {
      name: 'legacy',
      shorthand: null,
      type: Boolean,
      deprecated: true,
      description: 'Deprecated flag',
    },
    {
      name: 'hidden-opt',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      // intentionally undocumented
    },
  ],
  subcommands: [
    {
      name: 'list',
      aliases: ['ls'],
      description: 'List items',
      default: true,
      arguments: [],
      options: [
        {
          name: 'tag',
          shorthand: null,
          type: [String],
          deprecated: false,
          description: 'Filter by tag',
          argument: 'TAG',
        },
      ],
      disabledGlobalOptions: ['cwd'],
      subcommands: [],
    },
    {
      name: 'add',
      aliases: [],
      description: 'Add an item',
      arguments: [{ name: 'name', required: true }],
      options: [],
      subcommands: [
        {
          name: 'rule',
          aliases: [],
          description: 'Add a rule',
          arguments: [],
          options: [],
          subcommands: [],
        },
      ],
    },
    {
      name: 'secret',
      aliases: [],
      description: 'Hidden command',
      hidden: true,
      arguments: [],
      options: [],
      subcommands: [],
    },
  ],
};
