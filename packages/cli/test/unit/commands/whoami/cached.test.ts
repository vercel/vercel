import { describe, expect, it } from 'vitest';
import { getWhoamiCachedAnswer } from '../../../../src/commands/whoami/cached';

describe('getWhoamiCachedAnswer', () => {
  const authConfig = {
    token: 't',
    userId: 'user_saved',
    cachedUser: { id: 'user_saved', username: 'saved-name' },
  };

  it('answers with the saved name for `whoami --cached`', () => {
    expect(getWhoamiCachedAnswer(['whoami', '--cached'], authConfig)).toBe(
      'saved-name'
    );
  });

  it('does not answer without `--cached`', () => {
    expect(getWhoamiCachedAnswer(['whoami'], authConfig)).toBeUndefined();
  });

  it('does not answer when no name is saved for the current user', () => {
    expect(
      getWhoamiCachedAnswer(['whoami', '--cached'], { token: 't' })
    ).toBeUndefined();
  });
});
