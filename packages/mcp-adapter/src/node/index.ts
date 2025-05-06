import { initializeMcpApiHandler } from '../next/mcp-api-handler';
import type { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Config } from '../lib/types';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { incomingMessageToRequest } from './incoming-message-helper';

/**
 * Creates a MCP handler that can be used to handle MCP requests.
 * @param initializeServer - A function that initializes the MCP server. Use this to access the server instance and register tools, prompts, and resources.
 * @param serverOptions - Options for the MCP server.
 * @param config - Configuration for the MCP handler.
 * @returns A function that can be used to handle MCP requests.
 */
export default function createMcpRouteHandlerNode(
  initializeServer: (server: McpServer) => void,
  serverOptions?: ServerOptions,
  config?: Config
): (inc: IncomingMessage, res: ServerResponse) => Promise<void> {
  const mcpHandler = initializeMcpApiHandler(
    initializeServer,
    serverOptions,
    config
  );
  return (inc: IncomingMessage, res: ServerResponse) => {
    const req = incomingMessageToRequest(inc);
    return mcpHandler(req, res);
  };
}
