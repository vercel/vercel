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
  Omit<Framework, 'description' | 'getOutputDirName'>
> = [
  {
    name: 'Turborepo',
    slug: 'turbo',
    logo: 'https://api-frameworks.vercel.sh/monorepo-logos/turborepo.svg',
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
    settings: {
      buildCommand: {
        placeholder: 'Turborepo default',
      },
    },
  },
  {
    name: 'Nx',
    slug: 'nx',
    logo: 'https://api-frameworks.vercel.sh/monorepo-logos/nx.svg',
    detectors: {
      every: [
        {
          path: 'nx.json',
        },
      ],
    },
    settings: {
      buildCommand: {
        placeholder: 'Nx default',
      },
      outputDirectory: {
        placeholder: 'Nx default',
      },
    },
  },
  {
    name: 'Rush',
    slug: 'rush',
    logo: 'https://api-frameworks.vercel.sh/monorepo-logos/rush.svg',
    detectors: {
      every: [
        {
          path: 'rush.json',
        },
      ],
    },
    settings: {
      installCommand: {
        placeholder: 'Rush default',
      },
      buildCommand: {
        placeholder: 'Rush default',
      },
      outputDirectory: {
        placeholder: 'Rush default',
      },
    },
  },
];

export default monorepoManagers;
