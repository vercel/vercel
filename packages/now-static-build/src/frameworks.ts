import { readdir, stat } from 'fs';
import { promisify } from 'util';
import { join } from 'path';

const readirPromise = promisify(readdir);
const statPromise = promisify(stat);
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

export default [
  {
    name: 'Gatsby.js',
    dependency: 'gatsby',
    getOutputDirName: async () => 'public',
  },
  {
    name: 'Hexo',
    dependency: 'hexo',
    getOutputDirName: async () => 'public',
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
    name: 'Vue.js',
    dependency: '@vue/cli-service',
    getOutputDirName: async () => 'dist',
    defaultRoutes: [
      {
        handle: 'filesystem',
      },
      {
        src: '^/js/(.*)',
        headers: { 'cache-control': 'max-age=31536000, immutable' },
        dest: '/js/$1',
      },
      {
        src: '^/css/(.*)',
        headers: { 'cache-control': 'max-age=31536000, immutable' },
        dest: '/css/$1',
      },
      {
        src: '^/img/(.*)',
        headers: { 'cache-control': 'max-age=31536000, immutable' },
        dest: '/img/$1',
      },
      {
        src: '/(.*)',
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
        dest: '/static/$1',
      },
      {
        src: '/favicon.ico',
        dest: '/favicon.ico',
      },
      {
        src: '/asset-manifest.json',
        dest: '/asset-manifest.json',
      },
      {
        src: '/manifest.json',
        dest: '/manifest.json',
      },
      {
        src: '/precache-manifest.(.*)',
        dest: '/precache-manifest.$1',
      },
      {
        src: '/service-worker.js',
        headers: { 'cache-control': 's-maxage=0' },
        dest: '/service-worker.js',
      },
      {
        src: '/sockjs-node/(.*)',
        dest: '/sockjs-node/$1',
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
    name: 'Docusaurus',
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
];
