# @vercel/mcp-adapter

A Vercel adapter for the Model Context Protocol (MCP), enabling real-time communication between your applications and AI models. Currently supports Next.js with more framework adapters coming soon.

Currently uses `**@modelcontextprotocol/sdk@1.10.2**`

## Installation

```bash
npm install @vercel/mcp-adapter
# or
yarn add @vercel/mcp-adapter
# or
pnpm add @vercel/mcp-adapter
```

## Next.js Usage

1. Create an API route for MCP communication:

```typescript
// app/api/[transport]/route.ts
import { createMcpHandler } from '@vercel/mcp-adapter';
const handler = createMcpHandler(
  server => {
    server.tool(
      'roll_dice',
      'Rolls an N-sided die',
      { sides: z.number().int().min(2) },
      async ({ sides }) => {
        const value = 1 + Math.floor(Math.random() * sides);
        return {
          content: [{ type: 'text', text: `🎲 You rolled a ${value}!` }],
        };
      }
    );
  },
  {
    // Optional server options
  },
  {
    // Optional configuration
    redisUrl: process.env.REDIS_URL,
    // You can now use basePath to automatically derive all endpoints
    basePath: '/api/mcp',
    // Or specify endpoints explicitly if you prefer
    maxDuration: 60,
    verboseLogs: true,
  }
);
export { handler as GET, handler as POST };
```

1. Use the MCP client in your application:

```typescript
// app/components/YourComponent.tsx
import { McpClient } from '@modelcontextprotocol/sdk/client';

const client = new McpClient({
  // When using basePath, the SSE endpoint will be automatically derived
  transport: new SSEClientTransport('/api/mcp/sse'),
});

// Use the client to make requests
const result = await client.request('yourMethod', { param: 'value' });
```

## Configuration Options

The `initializeMcpApiHandler` function accepts the following configuration options:

```typescript
type Config = {
  /**
   * The URL of the Redis instance to use for the MCP handler.
   * @default process.env.REDIS_URL || process.env.KV_URL
   */
  redisUrl?: string;

  /**
   * The base path to use for deriving endpoints.
   * If provided, endpoints will be derived from this path.
   * For example, if basePath is "/api/mcp", then:
   * - streamableHttpEndpoint will be "/api/mcp"
   * - sseEndpoint will be "/api/mcp/sse"
   * - sseMessageEndpoint will be "/api/mcp/message"
   */
  basePath?: string;

  /**
   * The endpoint to use for the streamable HTTP transport.
   * @deprecated Use `set basePath` instead.
   * @default "/mcp" or derived from basePath
   */
  streamableHttpEndpoint?: string;

  /**
   * The endpoint to use for the SSE transport.
   * @deprecated Use `set basePath` instead.
   * @default "/sse" or derived from basePath
   */
  sseEndpoint?: string;

  /**
   * The endpoint to use for the SSE messages transport.
   * @deprecated Use `set basePath` instead.
   * @default "/message" or derived from basePath
   */
  sseMessageEndpoint?: string;

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
```

## Features

- **Framework Support**: Currently supports Next.js with more framework adapters coming soon
- **Multiple Transport Options**: Supports both Streamable HTTP and Server-Sent Events (SSE) transports
- **Redis Integration**: For SSE transport resumability
- **TypeScript Support**: Full TypeScript support with type definitions

## Requirements

- Next.js 13 or later (for Next.js adapter)
- Node.js 18 or later
- Redis (optional, for SSE transport)

## License

MIT
