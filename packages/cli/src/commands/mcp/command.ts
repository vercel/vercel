import { packageName } from '../../util/pkg-name';

export const mcpCommand = {
  name: 'mcp',
  aliases: [],
  description: 'Set up MCP agents and configuration for Vercel integration',
  arguments: [],
  options: [
    {
      name: 'project',
      description:
        'Set up project-specific MCP access for the currently linked project',
      shorthand: null,
      type: Boolean,
      deprecated: false,
    },
  ],
  examples: [
    {
      name: 'Interactively set up MCP agents',
      value: `${packageName} mcp`,
    },
    {
      name: 'Set up project-specific MCP access',
      value: `${packageName} mcp --project`,
    },
  ],
} as const;
