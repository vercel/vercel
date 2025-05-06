/**
 * Configuration for the MCP handler.
 * @property redisUrl - The URL of the Redis instance to use for the MCP handler.
 * @property streamableHttpEndpoint - The endpoint to use for the streamable HTTP transport.
 * @property sseEndpoint - The endpoint to use for the SSE transport.
 * @property verboseLogs - If true, enables console logging.
 */
export type Config = {
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
   * The maximum duration of an MCP request in seconds.
   * @default 60
   */
  maxDuration?: number;
  /**
   * If true, enables console logging.
   * @default false
   */
  verboseLogs?: boolean;
};
