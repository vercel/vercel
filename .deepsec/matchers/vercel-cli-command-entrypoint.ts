import type { CandidateMatch, MatcherPlugin } from 'deepsec/config';

const TEST_FILE = /(?:^|\/)(?:__tests__|test|tests|fixtures?)\/|\.(?:test|spec)\.[tj]sx?$/;
const CLI_COMMAND_SHAPE =
  /\bparseArguments\s*\(|\bclient\.fetch\s*\(|\boutput\.(?:print|debug|error|warn)\s*\(|\bexport\s+default\s+|\bexport\s+(?:async\s+)?function\s+|\bexport\s+const\s+\w+/;

export const vercelCliCommandEntrypoint: MatcherPlugin = {
  slug: 'vercel-cli-command-entrypoint',
  description:
    'Vercel CLI command modules that parse user input, call APIs, or perform command actions',
  noiseTier: 'noisy',
  filePatterns: ['packages/cli/src/commands/**/*.{ts,js}'],
  match(content, filePath): CandidateMatch[] {
    if (TEST_FILE.test(filePath)) return [];
    if (/\/types\.ts$/.test(filePath)) return [];

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!CLI_COMMAND_SHAPE.test(lines[i])) continue;
      return [
        {
          vulnSlug: 'vercel-cli-command-entrypoint',
          lineNumbers: [i + 1],
          snippet: lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 8)).join('\n'),
          matchedPattern: 'Vercel CLI command module entry point',
        },
      ];
    }

    return [];
  },
};
