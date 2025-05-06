import createMcpRouteHandler from '../src/next';

const handler = createMcpRouteHandler(
  server => {
    server.tool('echo', 'Echo a message', {}, async () => {
      return {
        content: [
          {
            type: 'text',
            text: 'Hello, world!',
          },
        ],
      };
    });
  },
  // Optional: Comes from the McpServer.options
  {
    capabilities: {},
  },
  // Optional: Comes from the createMcpRouteHandler config
  {
    streamableHttpEndpoint: '/mcp',
    sseEndpoint: '/sse',
    redisUrl: process.env.REDIS_URL,
  }
);

export { handler as GET, handler as POST };
