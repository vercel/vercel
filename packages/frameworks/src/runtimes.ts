import { Language, Runtime, LanguageRuntimes } from './types';

/**
 * Per-language runtime configuration. Each language has a single default
 * runtime; languages with more than one option declare detectors for the
 * alternatives.
 */
export const runtimes: Record<Language, LanguageRuntimes> = {
  [Language.JavaScript]: {
    default: Runtime.Node,
    alternatives: [
      {
        runtime: Runtime.Bun,
        detectors: {
          some: [
            { path: 'bun.lock' },
            { path: 'bun.lockb' },
            {
              path: 'package.json',
              matchContent: '"engines"\\s*:\\s*\\{[^}]*"bun"\\s*:',
            },
            {
              path: 'package.json',
              matchContent: '"packageManager"\\s*:\\s*"bun@',
            },
          ],
        },
      },
    ],
  },
  [Language.Python]: { default: Runtime.Python },
  [Language.Go]: { default: Runtime.Go },
  [Language.Ruby]: { default: Runtime.Ruby },
  [Language.Rust]: { default: Runtime.Rust },
};

export default runtimes;
