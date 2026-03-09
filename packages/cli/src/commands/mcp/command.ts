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
    {
      name: 'clients',
      description:
        'Comma-separated list of clients to set up (required in non-interactive mode). Options: Claude Code, Claude.ai and Claude for desktop, Cursor, VS Code with Copilot',
      shorthand: null,
      type: String,
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
    {
      name: 'Non-interactive: set up Cursor only',
      value: `${packageName} mcp --clients Cursor`,
    },
    {
      name: 'Non-interactive: set up multiple clients',
      value: `${packageName} mcp --clients "Claude Code,Cursor"`,
    },
  ],
} as const;
