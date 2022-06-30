import confirm from '../../../src/util/input/confirm';
import { client } from '../../mocks/client';

describe('confirm()', () => {
  it('should work with multiple prompts', async () => {
    // true (explicit)
    let confirmedPromise = confirm(client, 'Explictly true?', false);
    await expect(client.stderr).toOutput('Explictly true? [y/N]');
    client.stdin.write('yes\n');
    let confirmed = await confirmedPromise;
    expect(confirmed).toEqual(true);

    // false (explicit)
    confirmedPromise = confirm(client, 'Explcitly false?', true);
    await expect(client.stderr).toOutput('Explcitly false? [Y/n]');
    client.stdin.write('no\n');
    confirmed = await confirmedPromise;
    expect(confirmed).toEqual(false);

    // true (default)
    confirmedPromise = confirm(client, 'Default true?', true);
    await expect(client.stderr).toOutput('Default true? [Y/n]');
    client.stdin.write('\n');
    confirmed = await confirmedPromise;
    expect(confirmed).toEqual(true);

    // false (default)
    confirmedPromise = confirm(client, 'Default false?', false);
    await expect(client.stderr).toOutput('Default false? [y/N]');
    client.stdin.write('\n');
    confirmed = await confirmedPromise;
    expect(confirmed).toEqual(false);
  });
});
