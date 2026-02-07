export const initSubcommand = {
  name: 'init',
  aliases: [],
  description:
    'Generate agent configuration files (AGENTS.md, .cursorrules) with Vercel best practices',
  arguments: [],
  options: [
    {
      name: 'format',
      shorthand: null,
      type: String,
      deprecated: false,
      description:
        'Output format: markdown, cursorrules, copilot, all, or auto (default: auto)',
    },
    {
      name: 'force',
      shorthand: 'f',
      type: Boolean,
      deprecated: false,
      description: 'Overwrite existing agent configuration files',
    },
    {
      name: 'dry-run',
      shorthand: null,
      type: Boolean,
      deprecated: false,
      description: 'Preview what would be generated without writing files',
    },
  ],
  examples: [
    {
      name: 'Generate agent files with auto-detected format',
      value: 'vercel agents init',
    },
    {
      name: 'Generate all supported formats',
      value: 'vercel agents init --format=all',
    },
    {
      name: 'Generate only markdown format',
      value: 'vercel agents init --format=markdown',
    },
    {
      name: 'Preview without writing files',
      value: 'vercel agents init --dry-run',
    },
    {
      name: 'Overwrite existing files',
      value: 'vercel agents init --force',
    },
  ],
} as const;

export const agentsCommand = {
  name: 'agents',
  aliases: [],
  description:
    'Manage AI agent configuration files with Vercel deployment best practices',
  arguments: [],
  subcommands: [initSubcommand],
  options: [],
  examples: [
    {
      name: 'Initialize agent configuration files',
      value: 'vercel agents init',
    },
    {
      name: 'Generate files for all supported agents',
      value: 'vercel agents init --format=all',
    },
  ],
} as const;
