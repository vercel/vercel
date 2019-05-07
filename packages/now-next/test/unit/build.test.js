/* global expect, it, jest */
const path = require('path');
const os = require('os');
const { build } = require('@now/next');
const { FileBlob } = require('@now/build-utils');

jest.setTimeout(45000);

describe('build meta dev', () => {
  const files = {
    'next.config.js': new FileBlob({
      mode: 0o777,
      data: `
      module.exports = {
        target: 'serverless'
      }
    `,
    }),
    'pages/index.js': new FileBlob({
      mode: 0o777,
      data: `
      export default () => 'Index page'
    `,
    }),
    // This file should be omitted because `pages/index.js` will use the same route
    'public/index': new FileBlob({
      mode: 0o777,
      data: 'text',
    }),
    'public/data.txt': new FileBlob({
      mode: 0o777,
      data: 'data',
    }),
    'package.json': new FileBlob({
      mode: 0o777,
      data: `
      {
        "scripts": {
          "now-build": "next build"
        },
        "dependencies": {
          "next": "8",
          "react": "16",
          "react-dom": "16"
        }
      }
    `,
    }),
  };
  const entrypoint = 'next.config.js';
  const workPath = path.join(
    os.tmpdir(),
    Math.random()
      .toString()
      .slice(3),
  );
  console.log('workPath directory: ', workPath);
  /*
  it('should have builder v2 response isDev=false', async () => {
    const meta = { isDev: false, requestPath: null };
    const { output, routes, watch } = await build({
      files,
      workPath,
      entrypoint,
      meta,
    });
    //console.log('output: ', Object.keys(output));
    expect(Object.keys(output).length).toBe(7);
    expect(output.index.type).toBe('Lambda');
    expect(routes.length).toBe(0);
    expect(watch.length).toBe(0);
  });
  */

  it('should have builder v2 response isDev=true', async () => {
    const meta = { isDev: true, requestPath: null };
    const {
      output, routes, watch, childProcesses,
    } = await build({
      files,
      workPath,
      entrypoint,
      meta,
    });
    routes.forEach((route) => {
      // eslint-disable-next-line no-param-reassign
      route.dest = route.dest.replace(':4000', ':5000');
    });
    expect(output).toEqual({});
    expect(routes).toEqual([
      { src: '/_next/(.*)', dest: 'http://localhost:5000/_next/$1' },
      { src: '/static/(.*)', dest: 'http://localhost:5000/static/$1' },
      { src: '/index', dest: 'http://localhost:5000/index' },
      { src: '/', dest: 'http://localhost:5000/' },
      { src: '/data.txt', dest: 'http://localhost:5000/data.txt' },
    ]);
    expect(watch).toEqual([
      'next.config.js',
      'pages/index.js',
      'public/index',
      'public/data.txt',
      'package.json',
    ]);
    childProcesses.forEach(cp => cp.kill());
  });
});
