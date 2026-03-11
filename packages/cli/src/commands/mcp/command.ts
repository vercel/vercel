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
        'Comma-separated list of MCP clients to set up. In interactive mode, skips the client picker when set. Required in non-interactive mode. Options: Claude Code, Claude.ai and Claude for desktop, Cursor, VS Code with Copilot',
      shorthand: null,
      type: String,
      argument: 'CLIENTS',
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
      name: 'Non-interactive: set up Cursor and VS Code',
      value: `${packageName} mcp --clients "Cursor,VS Code with Copilot"`,
    },
  ],
} as const;
