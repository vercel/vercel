import type { Framework } from '@vercel/frameworks';

/**
 * The supported list of monorepo managers.
 *
 * This list is designed to work with the @see {@link detectFramework} function.
 *
 * @example
 *   import { monorepoManagers as frameworkList } from '@vercel/fs-detectors'
 *   import { detectFramework } from '@vercel/fs-detectors'
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
  {
    name: 'Nx',
    slug: 'nx',
    detectors: {
      every: [
        {
          path: 'nx.json',
        },
      ],
    },
  },
  {
    name: 'Rush',
    slug: 'rush',
    detectors: {
      every: [
        {
          path: 'rush.json',
        },
      ],
    },
  },
];

export default monorepoManagers;
