import { describe, expect, it } from 'vitest';
import { getReleaseNotesUrl } from '../../../src/util/release-notes-url';

describe('getReleaseNotesUrl', () => {
  it('links to the version anchor on the docs release notes page', () => {
    const url = getReleaseNotesUrl('60.1.3');

    expect(url).toBe('https://vercel.com/docs/cli/release-notes#vercel@60.1.3');
    expect(url).not.toContain('github.com');
  });
});
