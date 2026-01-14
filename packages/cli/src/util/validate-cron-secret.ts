import { NowBuildError } from '@vercel/build-utils';

/**
 * Validates that the CRON_SECRET environment variable contains only characters
 * that are valid in HTTP header values.
 *
 * According to RFC 7230, HTTP header field values may only contain:
 * - Visible ASCII characters (0x21-0x7E)
 * - Space (0x20) and horizontal tab (0x09) - but not at the start or end
 *
 * CRON_SECRET is sent as an Authorization header when Vercel invokes cron jobs,
 * so it must contain only valid HTTP header characters.
 *
 * @param cronSecret - The value of the CRON_SECRET environment variable
 * @returns NowBuildError if invalid, null if valid or not set
 */
export function validateCronSecret(
  cronSecret: string | undefined
): NowBuildError | null {
  if (!cronSecret) {
    return null;
  }

  // Check for leading or trailing whitespace
  if (cronSecret !== cronSecret.trim()) {
    return new NowBuildError({
      code: 'INVALID_CRON_SECRET',
      message:
        'The `CRON_SECRET` environment variable contains whitespace, or a special characters which is not allowed in HTTP header values.',
      link: 'https://vercel.link/securing-cron-jobs',
      action: 'Learn More',
    });
  }

  // Find any invalid characters
  const invalidChars: Array<{ char: string; index: number; code: number }> = [];

  for (let i = 0; i < cronSecret.length; i++) {
    const code = cronSecret.charCodeAt(i);
    // Valid characters are:
    // - Horizontal tab (0x09)
    // - Space (0x20)
    // - Visible ASCII characters (0x21-0x7E)
    const isValidChar =
      code === 0x09 || // HTAB
      (code >= 0x20 && code <= 0x7e); // Space through tilde (visible ASCII)

    if (!isValidChar) {
      invalidChars.push({
        char: cronSecret[i],
        index: i,
        code,
      });
    }
  }

  if (invalidChars.length > 0) {
    const descriptions = invalidChars.slice(0, 3).map(({ code, index }) => {
      if (code < 0x20) {
        return `control character (0x${code.toString(16).padStart(2, '0')}) at position ${index}`;
      } else if (code === 0x7f) {
        return `DEL character at position ${index}`;
      } else {
        return `non-ASCII character (0x${code.toString(16).padStart(2, '0')}) at position ${index}`;
      }
    });

    const moreCount = invalidChars.length - 3;
    const moreText = moreCount > 0 ? `, and ${moreCount} more` : '';

    return new NowBuildError({
      code: 'INVALID_CRON_SECRET',
      message: `The \`CRON_SECRET\` environment variable contains characters that are not valid in HTTP headers: ${descriptions.join(', ')}${moreText}. Only visible ASCII characters (letters, digits, symbols), spaces, and tabs are allowed.`,
      link: 'https://vercel.link/securing-cron-jobs',
      action: 'Learn More',
    });
  }

  return null;
}
