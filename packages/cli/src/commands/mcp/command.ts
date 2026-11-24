import { packageName } from '../../util/pkg-name';

export const mcpCommand = {
  name: 'mcp',
  aliases: [],
  summary: 'Set up MCP agents for Vercel',
  description: 'Set up MCP agents and configuration for Vercel integration',
  arguments: [],
  options: [
    {
      name: 'project',
      description:
        'Deprecated: project-specific MCP URLs are no longer supported. Sets up the shared Vercel MCP endpoint.',
      shorthand: null,
      type: Boolean,
      deprecated: true,
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
      name: 'Non-interactive: set up Cursor and VS Code',
      value: `${packageName} mcp --clients "Cursor,VS Code with Copilot"`,
    },
  ],
} as const;
