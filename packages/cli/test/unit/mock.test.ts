import confirm from '../../src/util/input/confirm';
import { client } from '../mocks/client';

describe('MockClient', () => {
  it('should mock `confirm()`', async () => {
    // true (explicit)
    let confirmedPromise = confirm(client, 'Do the thing?', false);
    await expect(client.stderr).toOutput('Do the thing? [y/N]');
    client.stdin.write('yes\n');
    let confirmed = await confirmedPromise;
    expect(confirmed).toEqual(true);

    // false (explicit)
    confirmedPromise = confirm(client, 'Do the thing?', true);
    await expect(client.stderr).toOutput('Do the thing? [y/N]');
    client.stdin.write('no\n');
    confirmed = await confirmedPromise;
    expect(confirmed).toEqual(false);

    // true (default)
    confirmedPromise = confirm(client, 'Do the thing?', true);
    await expect(client.stderr).toOutput('Do the thing? [y/N]');
    client.stdin.write('\n');
    confirmed = await confirmedPromise;
    expect(confirmed).toEqual(true);

    // false (default)
    confirmedPromise = confirm(client, 'Do the thing?', false);
    await expect(client.stderr).toOutput('Do the thing? [y/N]');
    client.stdin.write('\n');
    confirmed = await confirmedPromise;
    expect(confirmed).toEqual(false);
  });
});
