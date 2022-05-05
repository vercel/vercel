import type { Framework } from '@vercel/frameworks';

/**
 * The supported list of workspace managers.
 *
 * This list is designed to work with the @see {@link detectFramework} function.
 *
 * @example
 *   import { workspaceManagers as frameworkList } from '@vercel/build-utils/workspaces'
 *   import { detectFramework } from '@vercel/build-utils'
 *
 *   const fs = new GitDetectorFilesystem(...)
 *   detectFramwork({ fs, frameworkList }) // returns the 'slug' field if detected, otherwise null
 *
 * @todo Will be used by the detect-eligible-projects API endpoint for a given git url.
 */
export const workspaceManagers: Array<Framework> = [
  {
    name: 'Yarn',
    slug: 'yarn',
    detectors: {
      every: [
        {
          path: 'package.json',
          matchContent:
            '"workspaces":\\s*(?:\\[[^\\]]*]|{[^}]*"packages":[^}]*})',
        },
        {
          path: 'yarn.lock',
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
  {
    name: 'pnpm',
    slug: 'pnpm',
    detectors: {
      every: [
        {
          path: 'pnpm-workspace.yaml',
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
  {
    name: 'npm',
    slug: 'npm',
    detectors: {
      every: [
        {
          path: 'package.json',
          matchContent:
            '"workspaces":\\s*(?:\\[[^\\]]*]|{[^}]*"packages":[^}]*})',
        },
        {
          path: 'package-lock.json',
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

export default workspaceManagers;
