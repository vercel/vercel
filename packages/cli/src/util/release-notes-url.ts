export const RELEASE_NOTES_URL = 'https://vercel.com/docs/cli/release-notes';

/** Link to the release notes for one Vercel CLI version. */
export function getReleaseNotesUrl(version: string): string {
  return `${RELEASE_NOTES_URL}#vercel@${version}`;
}
