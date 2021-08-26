import { createServer } from 'http';
import listen from 'async-listen';
import Client from '../src/util/client';
import whoami from '../src/commands/whoami';
import createOutput from '../src/util/output';

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
      const output = createOutput({ debug: true });
      const client = new Client({
        argv: [],
        // @ts-ignore
        apiUrl: `http://127.0.0.1:${mock.address().port}`,
        authConfig: {},
        output,
        config: {},
        localConfig: {},
      });
      const result = await whoami(client);
      expect(result).toEqual(0);
    } finally {
      mock.close();
    }
  });
});
