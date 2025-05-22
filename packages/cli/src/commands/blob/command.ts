export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List all files in the Blob store',
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
      description: 'Cursor from previous page to start listing from',
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
  description: 'Upload a file to the Blob store',
  arguments: [
    {
      name: 'pathToFile',
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
      description:
        'If true upload the file in multiple smaller chunks. Default: true',
      argument: 'Boolean',
    },
    {
      name: 'content-type',
      shorthand: 't',
      type: String,
      deprecated: false,
      description:
        'Overwrite the content-type. Will be infered from the file extension if not provided',
      argument: 'String',
    },
    {
      name: 'cache-control-max-age',
      shorthand: 'c',
      type: Number,
      deprecated: false,
      description: 'Max-age of the cache-control header directive',
      argument: 'Number',
    },
    {
      name: 'force',
      shorthand: 'f',
      type: Boolean,
      deprecated: false,
      description: 'Overwrite the file if it already exists',
      argument: 'Boolean',
    },
  ],
  examples: [],
} as const;

export const delSubcommand = {
  name: 'del',
  aliases: [],
  description: 'Delete a file from the Blob store',
  arguments: [
    {
      name: '<URLS>',
      required: true,
    },
  ],
  options: [],
  examples: [],
} as const;

export const copySubcommand = {
  name: 'copy',
  aliases: ['cp'],
  description: 'Copy a file in the Blob store',
  arguments: [
    {
      name: 'fromUrl',
      required: true,
    },
    {
      name: 'toPathname',
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

export const newStoreSubcommand = {
  name: 'new',
  aliases: [],
  description: 'Create a new Blob store',
  arguments: [
    {
      name: 'name',
      required: false,
    },
  ],
  options: [],
  examples: [],
} as const;

export const removeStoreSubcommand = {
  name: 'remove',
  aliases: ['rm'],
  description: 'Remove a Blob store',
  arguments: [
    {
      name: 'storeId',
      required: false,
    },
  ],
  options: [],
  examples: [],
} as const;

export const blobCommand = {
  name: 'blob',
  aliases: [],
  description: 'Interact with Vercel Blob',
  arguments: [],
  subcommands: [
    listSubcommand,
    putSubcommand,
    delSubcommand,
    copySubcommand,
    newStoreSubcommand,
  ],
  options: [],
  examples: [],
} as const;
