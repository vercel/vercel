import confirm from '../../../src/util/input/confirm';
import { client } from '../../mocks/client';

describe('confirm()', () => {
  it('should work with multiple prompts', async () => {
    // true (explicit)
    let confirmedPromise = confirm(client, 'Explicitly true?', false);
    await expect(client.stderr).toOutput('Explicitly true?');
    client.stdin.write('h\n'); // vim left
    let confirmed = await confirmedPromise;
    expect(confirmed).toEqual(true);

    // false (explicit)
    confirmedPromise = confirm(client, 'Explicitly false?', true);
    await expect(client.stderr).toOutput('Explicitly false?');
    client.stdin.write('l\n'); // vim right
    confirmed = await confirmedPromise;
    expect(confirmed).toEqual(false);

    // true (default)
    confirmedPromise = confirm(client, 'Default true?', true);
    await expect(client.stderr).toOutput('Default true?');
    client.stdin.write('\n');
    confirmed = await confirmedPromise;
    expect(confirmed).toEqual(true);

    // false (default)
    confirmedPromise = confirm(client, 'Default false?', false);
    await expect(client.stderr).toOutput('Default false?');
    client.stdin.write('\n');
    confirmed = await confirmedPromise;
    expect(confirmed).toEqual(false);
  });
});
