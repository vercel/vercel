import { VERCEL_OIDC_TOKEN } from './constants';

const CONTENTS_HEADER = '# Created by Vercel CLI';

/**
 * Replaces the first OIDC token assignment, removes duplicates, and preserves
 * all unrelated file content. When no assignment exists, a CLI-owned entry is
 * appended using the file's existing line ending. Passing `undefined` removes
 * stale token assignments.
 */
export function updateOidcTokenContents(
  existing: string,
  token: string | undefined
): string {
  const assignment = `${VERCEL_OIDC_TOKEN}="${escapeValue(token)}"`;
  const oidcAssignment = new RegExp(
    `^(\\uFEFF?)[\\t ]*(?:export[\\t ]+)?${VERCEL_OIDC_TOKEN}[\\t ]*=[^\\r\\n]*(\\r\\n|\\n|\\r|$)`,
    'gm'
  );
  let tokenWritten = false;

  const withoutDuplicates = existing.replace(
    oidcAssignment,
    (_match, byteOrderMark: string, lineEnding: string) => {
      if (token !== undefined && !tokenWritten) {
        tokenWritten = true;
        return `${byteOrderMark}${assignment}${lineEnding}`;
      }
      return byteOrderMark;
    }
  );

  if (token === undefined || tokenWritten) {
    return withoutDuplicates;
  }

  const lineEnding = withoutDuplicates.match(/\r\n|\n|\r/)?.[0] ?? '\n';
  const hasTrailingLineEnding = /(?:\r\n|\n|\r)$/.test(withoutDuplicates);
  const hasTrailingBlankLine = /(?:\r\n|\n|\r){2}$/.test(withoutDuplicates);
  const separator =
    withoutDuplicates.length === 0 || hasTrailingBlankLine
      ? ''
      : hasTrailingLineEnding
        ? lineEnding
        : `${lineEnding}${lineEnding}`;

  return `${withoutDuplicates}${separator}${CONTENTS_HEADER}${lineEnding}${assignment}${lineEnding}`;
}

function escapeValue(value: string | undefined): string {
  return value ? value.replace(/\n/g, '\\n').replace(/\r/g, '\\r') : '';
}
