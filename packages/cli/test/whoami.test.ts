import { createServer } from 'http';
import listen from 'async-listen';
import Client from '../src/util/client';
import whoami from '../src/commands/whoami';
import { Output } from '../src/util/output';

describe('whoami', () => {
  it('should print the Vercel username', async () => {
    const mock = createServer((req, res) => {
      res.setHeader('content-type', 'application/json; charset=utf8');
      res.end(
        JSON.stringify({
          user: {
            uid: 'jMLRqzR8eiyiFgSqMGstIYFu',
            email: 'n@n8.io',
            name: null,
            username: 'n1',
            avatar: null,
            softBlock: null,
            limited: true,
          },
        })
      );
    });
    await listen(mock, 0);
    try {
      const output = new Output({ debug: false });
      output.print = jest.fn();
      Object.defineProperty(output, 'isTTY', { value: false });
      const client = new Client({
        argv: [],
        // @ts-ignore
        apiUrl: `http://127.0.0.1:${mock.address().port}`,
        authConfig: {},
        output,
        config: {},
        localConfig: {},
      });
      const exitCode = await whoami(client);
      expect(exitCode).toEqual(0);
      expect(client.output.print.mock.calls.length).toEqual(1);
      expect(client.output.print.mock.calls[0][0]).toEqual('n1\n');
    } finally {
      mock.close();
    }
  });
});
