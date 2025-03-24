export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all Blobs for a Project',
  arguments: [],
  options: [
    {
      name: 'limit',
      shorthand: 'l',
      type: Number,
      deprecated: false,
      description:
        'Number of results to return per page (default: 10, max: 1000)',
      argument: 'NUMBER',
    },
    {
      name: 'cursor',
      shorthand: 'c',
      type: String,
      deprecated: false,
      description: 'Cursor to start listing from',
      argument: 'STRING',
    },
    {
      name: 'prefix',
      shorthand: 'p',
      type: String,
      deprecated: false,
      description: 'Prefix to filter Blobs by',
      argument: 'STRING',
    },
    {
      name: 'mode',
      shorthand: 'm',
      type: String,
      deprecated: false,
      description: 'Mode to filter Blobs by either folded or expanded',
      argument: 'String',
      choices: ['folded', 'expanded'],
    },
  ],
  examples: [],
} as const;

export const blobCommand = {
  name: 'blob',
  aliases: [],
  description: 'Interact with Vercel Blob',
  arguments: [],
  subcommands: [listSubcommand],
  options: [],
  examples: [],
} as const;
