import type { IncomingMessage, ServerResponse } from 'node:http';
import { initializeMcpApiHandler } from '../next/mcp-api-handler';
import type { ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Configuration for the MCP handler.
 * @property redisUrl - The URL of the Redis instance to use for the MCP handler.
 * @property streamableHttpEndpoint - The endpoint to use for the streamable HTTP transport.
 * @property sseEndpoint - The endpoint to use for the SSE transport.
 * @property verboseLogs - If true, enables console logging.
 */
type Config = {
  /**
   * The URL of the Redis instance to use for the MCP handler.
   * @default process.env.REDIS_URL || process.env.KV_URL
   */
  redisUrl?: string;
  /**
   * The endpoint to use for the streamable HTTP transport.
   * @default "/mcp"
   */
  streamableHttpEndpoint?: string;
  /**
   * The endpoint to use for the SSE transport.
   * @default "/sse"
   */
  sseEndpoint?: string;
  /**
   * If true, enables console logging.
   * @default false
   */
  verboseLogs?: boolean;
};

/**
 * Creates a MCP handler for Vercel serverless functions that works with Node.js native request/response types.
 * @param initializeServer - A function that initializes the MCP server. Use this to access the server instance and register tools, prompts, and resources.
 * @param serverOptions - Options for the MCP server.
 * @param config - Configuration for the MCP handler.
 * @returns A function that can be used as a Vercel serverless function handler.
 */
export default function createMcpHandler(
  initializeServer: (server: McpServer) => void,
  serverOptions: ServerOptions,
  config: Config = {}
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const mcpHandler = initializeMcpApiHandler(
    initializeServer,
    serverOptions,
    config
  );

  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      // Get the request body if it exists
      let body: string | undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks).toString();
      }

      // Convert Node.js request to Web API Request
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers: req.headers as HeadersInit,
        body,
      });

      // Handle the request using the MCP handler
      await mcpHandler(request, res);
    } catch (error) {
      console.error('Error handling request:', error);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  };
}
