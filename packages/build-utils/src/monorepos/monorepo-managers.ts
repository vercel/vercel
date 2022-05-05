import type { Framework } from '@vercel/frameworks';

/**
 * The supported list of monorepo managers.
 *
 * This list is designed to work with the @see {@link detectFramework} function.
 *
 * @example
 *   import { monorepoManagers as frameworkList } from '@vercel/build-utils'
 *   import { detectFramework } from '@vercel/build-utils'
 *
 *   const fs = new GitDetectorFilesystem(...)
 *   detectFramwork({ fs, frameworkList }) // returns the 'slug' field if detected, otherwise null
 *
 * @todo Will be used by the detect-eligible-projects API endpoint for a given git url.
 */
export const monorepoManagers: Array<Framework> = [
  {
    name: 'Turborepo',
    slug: 'turbo',
    detectors: {
      every: [
        {
          path: 'turbo.json',
        },
      ],
    },
    // unused props - needed for typescript
    description: '',
    logo: '',
    settings: {
      buildCommand: {
        value: '',
        placeholder: '',
      },
      devCommand: {
        value: '',
        placeholder: '',
      },
      installCommand: {
        value: '',
        placeholder: '',
      },
      outputDirectory: {
        value: '',
        placeholder: '',
      },
    },
    getOutputDirName: () => Promise.resolve(''),
  },
];

export default monorepoManagers;
