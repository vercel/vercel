import confirm from '../../src/util/input/confirm';
import { client } from '../mocks/client';

describe('MockClient', () => {
  it('should mock `confirm()`', async () => {
    // true
    let confirmedPromise = confirm(client, 'Do the thing?', false);

    client.stdin.write('yes\n');

    client.stdout.setEncoding('utf8');
    client.stdout.on('data', d => console.log({ d }));

    let confirmed = await confirmedPromise;
    expect(confirmed).toEqual(true);

    // false
    confirmedPromise = confirm(client, 'Do the thing?', false);

    client.stdin.write('no\n');

    confirmed = await confirmedPromise;
    expect(confirmed).toEqual(false);
  });
});
