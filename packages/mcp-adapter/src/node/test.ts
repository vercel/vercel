import createMcpRouteHandlerNode from '.';

const handler = createMcpRouteHandlerNode(server => {
  server.tool('echo', 'Echo the input', {}, async () => {
    return {
      content: [{ type: 'text', text: 'Hello, world!' }],
    };
  });
});

export default handler;
