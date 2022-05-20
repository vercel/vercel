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
 */
export const monorepoManagers: Array<
  Omit<Framework, 'description' | 'logo' | 'settings' | 'getOutputDirName'>
> = [
  {
    name: 'Turborepo',
    slug: 'turbo',
    detectors: {
      some: [
        {
          path: 'turbo.json',
        },
        {
          path: 'package.json',
          matchContent: '"turbo":\\s*{[^}]*.+[^}]*}',
        },
      ],
    },
  },
];

export default monorepoManagers;
