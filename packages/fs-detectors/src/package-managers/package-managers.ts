import type { Framework } from '@vercel/frameworks';

export const packageManagers: Array<
  Omit<Framework, 'description' | 'getOutputDirName' | 'settings'>
> = [
  {
    name: 'npm',
    slug: 'npm',
    logo: '',
    darkModeLogo: '',
    detectors: {
      some: [
        {
          path: 'package-lock.json',
        },
        {
          path: 'package.json',
          matchContent: '"packageManager":\\s*"npm@.*"',
        },
      ],
    },
  },
  {
    name: 'pnpm',
    slug: 'pnpm',
    logo: '',
    darkModeLogo: '',
    detectors: {
      some: [
        {
          path: 'pnpm-lock.yaml',
        },
        {
          path: 'package.json',
          matchContent: '"packageManager":\\s*"pnpm@.*"',
        },
      ],
    },
  },
  {
    name: 'bun',
    slug: 'bun',
    logo: '',
    darkModeLogo: '',
    detectors: {
      some: [
        {
          path: 'bun.lockb',
        },
        {
          path: 'package.json',
          // Depends on https://github.com/nodejs/corepack/pull/307
          matchContent: '"packageManager":\\s*"bun@.*"',
        },
      ],
    },
  },
  {
    name: 'yarn',
    slug: 'yarn',
    logo: '',
    darkModeLogo: '',
    detectors: {
      some: [
        {
          path: 'yarn.lock',
        },
        {
          path: 'package.json',
          matchContent: '"packageManager":\\s*"yarn@.*"',
        },
        {
          path: 'package.json',
        },
      ],
    },
  },
];
