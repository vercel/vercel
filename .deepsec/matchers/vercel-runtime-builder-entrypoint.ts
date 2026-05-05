import type { CandidateMatch, MatcherPlugin } from 'deepsec/config';

const TEST_FILE = /(?:^|\/)(?:__tests__|test|tests|fixtures?)\/|\.(?:test|spec)\.[tj]sx?$/;
const RUNTIME_BUILDER_ENTRYPOINT =
  /export\s+(?:async\s+)?function\s+(?:build|startDevServer|prepareCache)\s*\(|export\s+const\s+version\s*=/;

export const vercelRuntimeBuilderEntrypoint: MatcherPlugin = {
  slug: 'vercel-runtime-builder-entrypoint',
  description:
    'Vercel runtime Builder API entry points: build(), startDevServer(), prepareCache(), and version exports',
  noiseTier: 'noisy',
  filePatterns: [
    'packages/node/src/**/*.{ts,js}',
    'packages/python/src/**/*.{ts,js}',
    'packages/go/src/**/*.{ts,js}',
    'packages/ruby/src/**/*.{ts,js}',
    'packages/static-build/src/**/*.{ts,js}',
    'packages/remix/src/**/*.{ts,js}',
    'packages/next/src/**/*.{ts,js}',
    'packages/cli/src/util/build/**/*.{ts,js}',
    'packages/cli/dist-bin/*.{cjs,mjs,js}',
  ],
  match(content, filePath): CandidateMatch[] {
    if (TEST_FILE.test(filePath)) return [];
    if (/packages\/cli\/dist-bin\/(?:index-bundled|vc-sidecar-assets)\./.test(filePath)) {
      return [];
    }

    const lines = content.split('\n');
    const matches: CandidateMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (!RUNTIME_BUILDER_ENTRYPOINT.test(lines[i])) continue;
      matches.push({
        vulnSlug: 'vercel-runtime-builder-entrypoint',
        lineNumbers: [i + 1],
        snippet: lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 5)).join('\n'),
        matchedPattern: 'Vercel runtime Builder API export',
      });
    }

    return matches.slice(0, 5);
  },
};
