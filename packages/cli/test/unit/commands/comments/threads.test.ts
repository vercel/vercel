import { describe, expect, it } from 'vitest';
import { parseThreadArg } from '../../../../src/commands/comments/threads';

describe('parseThreadArg', () => {
  it('passes plain IDs through untouched, whatever their shape', () => {
    // Thread IDs vary wildly in length in production (_ZHkq is real).
    expect(parseThreadArg('icZ9BnPPINuK')).toEqual({ id: 'icZ9BnPPINuK' });
    expect(parseThreadArg('_ZHkq')).toEqual({ id: '_ZHkq' });
  });

  it('extracts the ID and team slug from a webUrl', () => {
    expect(
      parseThreadArg('https://vercel.com/basehub/basehub/c/uX2sDcN1YypX?s=15')
    ).toEqual({ id: 'uX2sDcN1YypX', teamSlug: 'basehub' });
  });

  it('uses the last /c/ segment for nested paths', () => {
    expect(
      parseThreadArg('https://vercel.com/team/c/project/c/threadid')
    ).toEqual({ id: 'threadid', teamSlug: 'team' });
  });

  it('returns undefined for malformed percent-encoding instead of throwing', () => {
    expect(
      parseThreadArg('https://vercel.com/team/project/c/%')
    ).toBeUndefined();
  });

  it('drops an undecodable team slug but keeps a valid id', () => {
    expect(parseThreadArg('https://vercel.com/te%am/project/c/goodid')).toEqual(
      { id: 'goodid', teamSlug: undefined }
    );
  });

  it('returns undefined for URLs without a /c/ segment', () => {
    expect(
      parseThreadArg('https://vercel.com/basehub/basehub/settings')
    ).toBeUndefined();
    expect(parseThreadArg('https://vercel.com/team/project/c')).toBeUndefined();
  });
});
