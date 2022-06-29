import confirm from '../../src/util/input/confirm';
import { client } from '../mocks/client';

describe('MockClient', () => {
  it('should mock `confirm()`', async () => {
    // true
    let confirmedPromise = confirm(client, 'Do the thing?', false);

    //await client.expectStderr('Do the thing? [y/Nn');
    //expect(await client.expectStderr('Do the thing? [y/Nn')).
    await expect(client.stderr).toWaitFor('Do the thing? [y/N]');

    client.stdin.write('yes\n');

    let confirmed = await confirmedPromise;
    expect(confirmed).toEqual(true);

    //client.output.log('test');
    console.log(client.stderr.write('test'));
    await client.expectStderr('test');
    // false
    //confirmedPromise = confirm(client, 'Do the thing?', true);
    //await client.expectStderr('Do the thing? [Y/n]');

    //client.stdin.write('no\n');

    //confirmed = await confirmedPromise;
    //expect(confirmed).toEqual(false);
  });
});
