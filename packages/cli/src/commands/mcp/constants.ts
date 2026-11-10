export interface McpClientOption {
  slug: string;
  display: string;
}

export const MCP_CLIENTS: McpClientOption[] = [
  { slug: 'claude-code', display: 'Claude Code' },
  { slug: 'claude-desktop', display: 'Claude.ai and Claude for desktop' },
  { slug: 'cursor', display: 'Cursor' },
  { slug: 'vscode-copilot', display: 'VS Code with Copilot' },
];

export const MCP_CLIENT_DISPLAY_NAMES = MCP_CLIENTS.map(c => c.display);
