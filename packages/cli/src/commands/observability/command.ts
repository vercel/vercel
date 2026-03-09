import { formatOption, yesOption } from '../../util/arg-common';
import { packageName } from '../../util/pkg-name';

export const configGetSubcommand = {
  name: 'get',
  aliases: [],
  description: 'Get observability configuration',
  arguments: [],
  options: [formatOption],
  examples: [],
} as const;

export const configPatchSubcommand = {
  name: 'patch',
  aliases: [],
  description: 'Patch observability configuration (body from stdin or --file)',
  arguments: [],
  options: [
    {
      name: 'file',
      shorthand: 'f',
      type: String,
      deprecated: false,
      description: 'Path to JSON file for request body',
      argument: 'PATH',
    },
    formatOption,
  ],
  examples: [],
} as const;

export const configSetProjectSubcommand = {
  name: 'set-project',
  aliases: [],
  description: 'Set observability configuration for a project',
  arguments: [{ name: 'project-id', required: true }],
  options: [
    {
      name: 'file',
      shorthand: 'f',
      type: String,
      deprecated: false,
      description: 'Path to JSON file for request body',
      argument: 'PATH',
    },
    formatOption,
  ],
  examples: [],
} as const;

export const configSubcommand = {
  name: 'config',
  aliases: [],
  description: 'Manage observability configuration',
  arguments: [],
  subcommands: [
    configGetSubcommand,
    configPatchSubcommand,
    configSetProjectSubcommand,
  ],
  options: [],
  examples: [],
} as const;

export const notebooksListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List observability notebooks',
  default: true,
  arguments: [],
  options: [formatOption],
  examples: [],
} as const;

export const notebooksCreateSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create an observability notebook',
  arguments: [],
  options: [
    {
      name: 'file',
      shorthand: 'f',
      type: String,
      deprecated: false,
      argument: 'PATH',
      description: 'JSON body file',
    },
    formatOption,
  ],
  examples: [],
} as const;

export const notebooksGetSubcommand = {
  name: 'get',
  aliases: ['inspect'],
  description: 'Get an observability notebook',
  arguments: [{ name: 'notebook-id', required: true }],
  options: [formatOption],
  examples: [],
} as const;

export const notebooksUpdateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update an observability notebook',
  arguments: [{ name: 'notebook-id', required: true }],
  options: [
    {
      name: 'file',
      shorthand: 'f',
      type: String,
      deprecated: false,
      argument: 'PATH',
      description: 'JSON body file',
    },
    formatOption,
  ],
  examples: [],
} as const;

export const notebooksDeleteSubcommand = {
  name: 'delete',
  aliases: ['rm', 'remove'],
  description: 'Delete an observability notebook',
  arguments: [{ name: 'notebook-id', required: true }],
  options: [yesOption, formatOption],
  examples: [],
} as const;

export const notebooksShareSubcommand = {
  name: 'share',
  aliases: [],
  description: 'Share an observability notebook',
  arguments: [{ name: 'notebook-id', required: true }],
  options: [
    {
      name: 'file',
      shorthand: 'f',
      type: String,
      deprecated: false,
      argument: 'PATH',
      description: 'JSON body file',
    },
    formatOption,
  ],
  examples: [],
} as const;

export const notebooksSubcommand = {
  name: 'notebooks',
  aliases: ['notebook'],
  description: 'Manage observability notebooks',
  arguments: [],
  subcommands: [
    notebooksListSubcommand,
    notebooksCreateSubcommand,
    notebooksGetSubcommand,
    notebooksUpdateSubcommand,
    notebooksDeleteSubcommand,
    notebooksShareSubcommand,
  ],
  options: [],
  examples: [],
} as const;

export const funnelsListSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'List observability funnels',
  default: true,
  arguments: [],
  options: [formatOption],
  examples: [],
} as const;

export const funnelsCreateSubcommand = {
  name: 'create',
  aliases: [],
  description: 'Create an observability funnel',
  arguments: [],
  options: [
    {
      name: 'file',
      shorthand: 'f',
      type: String,
      deprecated: false,
      argument: 'PATH',
      description: 'JSON body file',
    },
    formatOption,
  ],
  examples: [],
} as const;

export const funnelsGetSubcommand = {
  name: 'get',
  aliases: ['inspect'],
  description: 'Get an observability funnel',
  arguments: [{ name: 'funnel-id', required: true }],
  options: [formatOption],
  examples: [],
} as const;

export const funnelsUpdateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Update an observability funnel',
  arguments: [{ name: 'funnel-id', required: true }],
  options: [
    {
      name: 'file',
      shorthand: 'f',
      type: String,
      deprecated: false,
      argument: 'PATH',
      description: 'JSON body file',
    },
    formatOption,
  ],
  examples: [],
} as const;

export const funnelsDeleteSubcommand = {
  name: 'delete',
  aliases: ['rm', 'remove'],
  description: 'Delete an observability funnel',
  arguments: [{ name: 'funnel-id', required: true }],
  options: [yesOption, formatOption],
  examples: [],
} as const;

export const funnelsSubcommand = {
  name: 'funnels',
  aliases: ['funnel'],
  description: 'Manage observability funnels',
  arguments: [],
  subcommands: [
    funnelsListSubcommand,
    funnelsCreateSubcommand,
    funnelsGetSubcommand,
    funnelsUpdateSubcommand,
    funnelsDeleteSubcommand,
  ],
  options: [],
  examples: [],
} as const;

export const querySubcommand = {
  name: 'query',
  aliases: [],
  description: 'Run an observability query (JSON body from stdin or --file)',
  arguments: [],
  options: [
    {
      name: 'file',
      shorthand: 'f',
      type: String,
      deprecated: false,
      description: 'Path to JSON file for query body',
      argument: 'PATH',
    },
    formatOption,
  ],
  examples: [
    {
      name: 'Run query from file',
      value: `${packageName} observability query --file query.json`,
    },
  ],
} as const;

export const observabilityCommand = {
  name: 'observability',
  aliases: ['o11y'],
  description:
    'Manage observability configuration, notebooks, funnels, and run queries',
  arguments: [],
  subcommands: [
    configSubcommand,
    notebooksSubcommand,
    funnelsSubcommand,
    querySubcommand,
  ],
  options: [
    {
      name: 'file',
      shorthand: 'f',
      type: String,
      deprecated: false,
      description: 'Path to JSON file for request body',
      argument: 'PATH',
    },
    formatOption,
    yesOption,
  ],
  examples: [],
} as const;
