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
    // Set the basePath to where the handler is to automatically derive all endpoints
    // This base path is for if this snippet is located at: /app/api/[transport]/route.ts
    basePath: '/api',
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
interface Config {
  redisUrl?: string; // Redis connection URL for pub/sub
  basePath?: string; // string; // Base path for MCP endpoints
  // @deprecated use 'basePath' instead
  streamableHttpEndpoint?: string; // Endpoint for streamable HTTP transport
  // @deprecated use 'basePath' instead
  sseEndpoint?: string; // Endpoint for SSE transport
  // @deprecated use 'basePath' instead
  sseMessageEndpoint?: string; // Endpoint for SSE message transport
  maxDuration?: number; // Maximum duration for SSE connections in seconds
  verboseLogs?: boolean; // Log debugging information
}
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
