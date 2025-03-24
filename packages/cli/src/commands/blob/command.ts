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

export const putSubcommand = {
  name: 'put',
  aliases: [],
  description: 'Upload a file to Blob',
  arguments: [
    {
      name: 'file',
      required: true,
    },
  ],
  options: [
    {
      name: 'add-random-suffix',
      shorthand: 'r',
      type: Boolean,
      deprecated: false,
      description: 'Add a random suffix to the file name',
      argument: 'Boolean',
    },
    {
      name: 'pathname',
      shorthand: 'p',
      type: String,
      deprecated: false,
      description: 'Pathname to upload the file to',
      argument: 'String',
    },
    {
      name: 'multipart',
      shorthand: 'u',
      type: Boolean,
      deprecated: false,
      description: 'Whether to use multipart upload',
      argument: 'Boolean',
    },
    {
      name: 'content-type',
      shorthand: 't',
      type: String,
      deprecated: false,
      description: 'The content type of the blob',
      argument: 'String',
    },
    {
      name: 'cache-control-max-age',
      shorthand: 'c',
      type: Number,
      deprecated: false,
      description: 'The max age of the cache control',
      argument: 'Number',
    },
  ],
  examples: [],
} as const;

export const delSubcommand = {
  name: 'del',
  aliases: [],
  description: 'Delete a file from Blob',
  arguments: [
    {
      name: '...urls',
      required: true,
    },
  ],
  options: [],
  examples: [],
} as const;

export const copySubcommand = {
  name: 'copy',
  aliases: ['cp'],
  description: 'Copy a file from Blob',
  arguments: [
    {
      name: 'from-url',
      required: true,
    },
    {
      name: 'to-pathname',
      required: true,
    },
  ],
  options: [
    {
      name: 'add-random-suffix',
      shorthand: 'r',
      type: Boolean,
      deprecated: false,
      description: 'Add a random suffix to the file name',
      argument: 'Boolean',
    },
    {
      name: 'content-type',
      shorthand: 't',
      type: String,
      deprecated: false,
      description: 'The content type of the blob',
      argument: 'String',
    },
    {
      name: 'cache-control-max-age',
      shorthand: 'c',
      type: Number,
      deprecated: false,
      description: 'The max age of the cache control',
      argument: 'Number',
    },
  ],
  examples: [],
} as const;

export const blobCommand = {
  name: 'blob',
  aliases: [],
  description: 'Interact with Vercel Blob',
  arguments: [],
  subcommands: [listSubcommand, putSubcommand, delSubcommand, copySubcommand],
  options: [],
  examples: [],
} as const;
