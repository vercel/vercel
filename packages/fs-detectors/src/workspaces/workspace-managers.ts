import type { Framework } from '@vercel/frameworks';

/**
 * The supported list of workspace managers.
 *
 * This list is designed to work with the @see {@link detectFramework} function.
 *
 * @example
 *   import { workspaceManagers as frameworkList } from '@vercel/fs-detectors'
 *   import { detectFramework } from '@vercel/fs-detectors'
 *
 *   const fs = new GitDetectorFilesystem(...)
 *   detectFramwork({ fs, frameworkList }) // returns the 'slug' field if detected, otherwise null
 *
 */
export const workspaceManagers: Array<
  Omit<Framework, 'description' | 'logo' | 'settings' | 'getOutputDirName'>
> = [
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
  },
  {
    name: 'nx',
    slug: 'nx',
    detectors: {
      every: [
        {
          path: 'workspace.json',
          matchContent: '"projects":\\s*{[^}]',
        },
      ],
    },
  },
  {
    name: 'rush',
    slug: 'rush',
    detectors: {
      every: [
        {
          path: 'rush.json',
        },
      ],
    },
  },
  {
    name: 'default',
    slug: 'yarn',
    detectors: {
      every: [
        {
          path: 'package.json',
          matchContent:
            '"workspaces":\\s*(?:\\[[^\\]]*]|{[^}]*"packages":[^}]*})',
        },
      ],
    },
  },
];

export default workspaceManagers;
