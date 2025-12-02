import { Runtime } from './types';

export const runtimes = [
  {
    name: 'Node.js',
    slug: 'node',
    logo: 'https://api-frameworks.vercel.sh/runtime-logos/node.svg',
    description:
      'Node.js is a runtime for JavaScript and TypeScript built on the V8 JavaScript engine.',
    builder: '@vercel/node',
    detectors: {
      every: [
        {
          matchPackage: 'node',
        },
      ],
    },
    settings: {
      installCommand: {
        placeholder:
          '`yarn install`, `pnpm install`, `npm install`, or `bun install`',
      },
      buildCommand: {
        placeholder: '`npm run build` or `node build`',
        value: '`npm run build`',
      },
      devCommand: {
        placeholder: '`npm run dev`',
        value: '`npm run dev`',
      },
      outputDirectory: {
        value: 'N/A',
      },
    },
    sort: 1,
  },
  {
    name: 'Python',
    slug: 'python',
    logo: 'https://api-frameworks.vercel.sh/runtime-logos/python.svg',
    description:
      'Python is a programming language that lets you work quickly and integrate systems more effectively.',
    builder: '@vercel/python',
    detectors: {
      some: [
        {
          path: 'requirements.txt',
        },
        {
          path: 'pyproject.toml',
        },
      ],
    },
    settings: {
      installCommand: {
        placeholder: '`pip install -r requirements.txt`',
      },
      buildCommand: {
        placeholder: 'None',
        value: null,
      },
      devCommand: {
        placeholder: 'None',
        value: null,
      },
      outputDirectory: {
        value: 'N/A',
      },
    },
    sort: 2,
  },
  {
    name: 'Other',
    slug: null,
    logo: 'https://api-frameworks.vercel.sh/framework-logos/other.svg',
    description: 'No framework or an unoptimized framework.',
    settings: {
      installCommand: {
        placeholder:
          '`yarn install`, `pnpm install`, `npm install`, or `bun install`',
      },
      buildCommand: {
        placeholder: '`npm run vercel-build` or `npm run build`',
        value: null,
      },
      devCommand: {
        placeholder: 'None',
        value: null,
      },
      outputDirectory: {
        placeholder: '`public` if it exists, or `.`',
      },
    },
    getOutputDirName: async () => 'public',
    sort: 3,
  },
] as const;

export const runtimeList = runtimes as readonly Runtime[];
export default runtimeList;
