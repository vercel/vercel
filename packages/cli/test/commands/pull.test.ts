import { client } from '../mocks/client';
import { useUser } from '../mocks/user';
import { useTeams } from '../mocks/team';
import pull from '../../src/commands/pull';
import { stdin, MockSTDIN } from 'mock-stdin';

// Key codes
const keys = {
  up: '\x1B\x5B\x41',
  down: '\x1B\x5B\x42',
  enter: '\x0D',
  space: '\x20',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('pull', () => {
  let io: MockSTDIN | null = null;
  beforeAll(() => {
    io = stdin();
  });
  afterAll(() => {
    io?.reset();
  });

  it('should handle linking', async () => {
    useUser();
    useTeams();
    setInterval(async () => {
      io?.send(keys.enter);
      await sleep(10);
      io?.send(keys.enter);
      await sleep(10);
      io?.send(keys.enter);
      await sleep(10);
      io?.send('cli');
      await sleep(10);
      io?.send(keys.enter);
      await sleep(10);
      io?.send(keys.enter);
      await sleep(10);
    }, 5);
    const exitCode = await pull(client);

    expect(exitCode).toEqual(0);
  });
});
