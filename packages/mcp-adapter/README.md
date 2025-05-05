# @vercel/mcp-adapter

A Vercel adapter for the Model Context Protocol (MCP), enabling real-time communication between your applications and AI models. Currently supports Next.js with more framework adapters coming soon.

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
// app/api/mcp/route.ts
import { initializeMcpApiHandler } from '@vercel/mcp-adapter/next';
import { z } from 'zod';

const mcpHandler = initializeMcpApiHandler(
  server => {
    // Initialize your MCP server here
    server.tool(
      'add_numbers',
      'adds 2 numbers together',
      { a: z.integer(), b: z.integer() },
      async params => {
        // Handle your method
        return { result: params.a + params.b };
      }
    );
  },
  {
    // Optional server options
  },
  {
    // Optional configuration
    redisUrl: process.env.REDIS_URL,
    streamableHttpEndpoint: '/api/mcp/stream',
    sseEndpoint: '/api/mcp/sse',
    maxDuration: 60, // Maximum duration in seconds
  }
);

export { mcpHandler as GET, mcpHandler as POST };
```

2. Use the MCP client in your application:

```typescript
// app/components/YourComponent.tsx
import { McpClient } from '@modelcontextprotocol/sdk/client';

const client = new McpClient({
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
  streamableHttpEndpoint?: string; // Endpoint for streamable HTTP transport
  sseEndpoint?: string; // Endpoint for SSE transport
  maxDuration?: number; // Maximum duration for SSE connections in seconds
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
