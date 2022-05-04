import { Monorepo } from './types';

export const monorepos = [
  {
    name: 'turbo',
    slug: 'turbo',
    website: 'https://turborepo.org/',
    detectors: {
      every: [
        {
          path: 'tubro.json'
        }
      ]
    }
  }
] as const;

const def = monorepos as readonly Monorepo[];
export default def;