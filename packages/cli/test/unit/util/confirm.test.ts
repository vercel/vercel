import { describe, expect, it } from 'vitest';
import { client } from '../../mocks/client';

describe('confirm()', () => {
  it('should work with multiple prompts', async () => {
    // true (explicit)
    let confirmedPromise = client.input.confirm('Explictly true?', false);
    await expect(client.stderr).toOutput('Explictly true? (y/N)');
    client.stdin.write('yes\n');
    let confirmed = await confirmedPromise;
    expect(confirmed).toEqual(true);

    // false (explicit)
    confirmedPromise = client.input.confirm('Explicitly false?', true);
    await expect(client.stderr).toOutput('Explicitly false? (Y/n)');
    client.stdin.write('no\n');
    confirmed = await confirmedPromise;
    expect(confirmed).toEqual(false);

    // true (default)
    confirmedPromise = client.input.confirm('Default true?', true);
    await expect(client.stderr).toOutput('Default true? (Y/n)');
    client.stdin.write('\n');
    confirmed = await confirmedPromise;
    expect(confirmed).toEqual(true);

    // false (default)
    confirmedPromise = client.input.confirm('Default false?', false);
    await expect(client.stderr).toOutput('Default false? (y/N)');
    client.stdin.write('\n');
    confirmed = await confirmedPromise;
    expect(confirmed).toEqual(false);
  });
});
