import createMcpRouteHandler from '../../../src/next/index';
import { z } from 'zod';

const handler = createMcpRouteHandler(server => {
  server.tool(
    'add numbers',
    'add 2 numbers',
    { a: z.number(), b: z.number() },
    args => {
      return {
        content: [
          {
            type: 'text',
            text: `The sum of ${args.a} and ${args.b} is ${args.a + args.b}`,
          },
        ],
      };
    }
  );
});

export { handler as GET, handler as POST };
