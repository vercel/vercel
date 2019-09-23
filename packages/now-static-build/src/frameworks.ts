import { readdir, stat, readFile, unlink } from 'fs';
import { promisify } from 'util';
import { join } from 'path';
import { Route } from '@now/build-utils';

const readirPromise = promisify(readdir);
const readFilePromise = promisify(readFile);
const statPromise = promisify(stat);
const unlinkPromise = promisify(unlink);
const isDir = async (file: string): Promise<boolean> =>
  (await statPromise(file)).isDirectory();

// Please note that is extremely important
// that the `dependency` property needs
// to reference a CLI. This is needed because
// you might want (for example) a Gatsby
// site that is powered by Preact, so you
// can't look for the `preact` dependency.
// Instead, you need to look for `preact-cli`
// when optimizing Preact CLI projects.

export const frameworks: Framework[] = [
  {
    name: 'Gatsby.js',
    dependency: 'gatsby',
    getOutputDirName: async () => 'public',
    defaultRoutes: async (dirPrefix: string) => {
      try {
        const nowRoutesPath = join(
          dirPrefix,
          'public',
          '__now_routes_g4t5bY.json'
        );
        const content = await readFilePromise(nowRoutesPath, 'utf8');
        const nowRoutes = JSON.parse(content);
        try {
          await unlinkPromise(nowRoutesPath);
        } catch (err) {
          // do nothing if deleting the file fails
        }
        return nowRoutes;
      } catch (err) {
        // if the file doesn't exist, we don't create routes
        return [];
      }
    },
  },
  {
    name: 'Hexo',
    dependency: 'hexo',
    getOutputDirName: async () => 'public',
  },
  {
    name: 'Eleventy',
    dependency: '@11ty/eleventy',
    getOutputDirName: async () => '_site',
  },
  {
    name: 'Docusaurus 2.0',
    dependency: '@docusaurus/core',
    getOutputDirName: async () => 'build',
  },
  {
    name: 'Preact',
    dependency: 'preact-cli',
    getOutputDirName: async () => 'build',
    defaultRoutes: [
      {
        handle: 'filesystem',
      },
      {
        src: '/(.*)',
        dest: '/index.html',
      },
    ],
  },
  {
    name: 'Ember',
    dependency: 'ember-cli',
    getOutputDirName: async () => 'dist',
    defaultRoutes: [
      {
        handle: 'filesystem',
      },
      {
        src: '/(.*)',
        dest: '/index.html',
      },
    ],
  },
  {
    name: 'Vue.js',
    dependency: '@vue/cli-service',
    getOutputDirName: async () => 'dist',
    defaultRoutes: [
      {
        src: '^/[^/]*\\.(js|txt|ico|json)',
        headers: { 'cache-control': 'max-age=300' },
        continue: true,
      },
      {
        src: '^/(img|js|css|fonts|media)/.*',
        headers: { 'cache-control': 'max-age=31536000, immutable' },
        continue: true,
      },
      {
        handle: 'filesystem',
      },
      {
        src: '^.*',
        dest: '/index.html',
      },
    ],
  },
  {
    name: 'Angular',
    dependency: '@angular/cli',
    minNodeRange: '10.x',
    getOutputDirName: async (dirPrefix: string) => {
      const base = 'dist';
      const location = join(dirPrefix, base);
      const content = await readirPromise(location);

      // If there is only one file in it that is a dir we'll use it as dist dir
      if (content.length === 1 && (await isDir(join(location, content[0])))) {
        return join(base, content[0]);
      }

      return base;
    },
    defaultRoutes: [
      {
        handle: 'filesystem',
      },
      {
        src: '/(.*)',
        dest: '/index.html',
      },
    ],
  },
  {
    name: 'Polymer',
    dependency: 'polymer-cli',
    getOutputDirName: async (dirPrefix: string) => {
      const base = 'build';
      const location = join(dirPrefix, base);
      const content = await readirPromise(location);
      const paths = content.filter(item => !item.includes('.'));

      return join(base, paths[0]);
    },
    defaultRoutes: [
      {
        handle: 'filesystem',
      },
      {
        src: '/(.*)',
        dest: '/index.html',
      },
    ],
  },
  {
    name: 'Svelte',
    dependency: 'sirv-cli',
    getOutputDirName: async () => 'public',
    defaultRoutes: [
      {
        handle: 'filesystem',
      },
      {
        src: '/(.*)',
        dest: '/index.html',
      },
    ],
  },
  {
    name: 'Create React App',
    dependency: 'react-scripts',
    getOutputDirName: async () => 'build',
    defaultRoutes: [
      {
        src: '/static/(.*)',
        headers: { 'cache-control': 's-maxage=31536000, immutable' },
        continue: true,
      },
      {
        src: '/service-worker.js',
        headers: { 'cache-control': 's-maxage=0' },
        continue: true,
      },
      {
        src: '/sockjs-node/(.*)',
        dest: '/sockjs-node/$1',
      },
      {
        handle: 'filesystem',
      },
      {
        src: '/(.*)',
        headers: { 'cache-control': 's-maxage=0' },
        dest: '/index.html',
      },
    ],
  },
  {
    name: 'Create React App (ejected)',
    dependency: 'react-dev-utils',
    getOutputDirName: async () => 'build',
    defaultRoutes: [
      {
        src: '/static/(.*)',
        headers: { 'cache-control': 's-maxage=31536000, immutable' },
        continue: true,
      },
      {
        src: '/service-worker.js',
        headers: { 'cache-control': 's-maxage=0' },
        continue: true,
      },
      {
        src: '/sockjs-node/(.*)',
        dest: '/sockjs-node/$1',
      },
      {
        handle: 'filesystem',
      },
      {
        src: '/(.*)',
        headers: { 'cache-control': 's-maxage=0' },
        dest: '/index.html',
      },
    ],
  },
  {
    name: 'Gridsome',
    dependency: 'gridsome',
    getOutputDirName: async () => 'dist',
  },
  {
    name: 'UmiJS',
    dependency: 'umi',
    getOutputDirName: async () => 'dist',
    defaultRoutes: [
      {
        handle: 'filesystem',
      },
      {
        src: '/(.*)',
        dest: '/index.html',
      },
    ],
  },
  {
    name: 'Docusaurus 1.0',
    dependency: 'docusaurus',
    getOutputDirName: async (dirPrefix: string) => {
      const base = 'build';
      const location = join(dirPrefix, base);
      const content = await readirPromise(location);

      // If there is only one file in it that is a dir we'll use it as dist dir
      if (content.length === 1 && (await isDir(join(location, content[0])))) {
        return join(base, content[0]);
      }

      return base;
    },
  },
  {
    name: 'Sapper',
    dependency: 'sapper',
    getOutputDirName: async () => '__sapper__/export',
  },
  {
    name: 'Saber',
    dependency: 'saber',
    getOutputDirName: async () => 'public',
    defaultRoutes: [
      {
        src: '/_saber/.*',
        headers: { 'cache-control': 'max-age=31536000, immutable' },
      },
      {
        handle: 'filesystem',
      },
      {
        src: '.*',
        status: 404,
        dest: '404.html',
      },
    ],
  },
];

export interface Framework {
  name: string;
  dependency?: string;
  getOutputDirName: (dirPrefix: string) => Promise<string>;
  defaultRoutes?: Route[] | ((dirPrefix: string) => Promise<Route[]>);
  minNodeRange?: string;
}
