import type { CandidateMatch, MatcherPlugin } from 'deepsec/config';

const TEST_FILE = /(?:^|\/)(?:__tests__|test|tests|fixtures?)\/|\.(?:test|spec)\.[tj]sx?$/;
const API_HANDLER_SHAPE = /\bwithApiHandler\s*\(/;

export const vercelApiHandlerEntrypoint: MatcherPlugin = {
  slug: 'vercel-api-handler-entrypoint',
  description: 'Vercel API route modules wrapped with withApiHandler(...)',
  noiseTier: 'noisy',
  filePatterns: ['api/**/*.ts'],
  match(content, filePath): CandidateMatch[] {
    if (TEST_FILE.test(filePath)) return [];
    if (filePath.startsWith('api/_lib/')) return [];

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!API_HANDLER_SHAPE.test(lines[i])) continue;
      return [
        {
          vulnSlug: 'vercel-api-handler-entrypoint',
          lineNumbers: [i + 1],
          snippet: lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 8)).join('\n'),
          matchedPattern: 'withApiHandler-wrapped API route',
        },
      ];
    }

    return [];
  },
};
