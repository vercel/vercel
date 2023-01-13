import { join } from 'path';
import ms from 'ms';
import fs, { mkdirp } from 'fs-extra';

const {
  fetch,
  fixture,
  sleep,
  testFixtureStdio,
  validateResponseHeaders,
} = require('./utils.js');

test(
  '[vercel dev] test trailingSlash true serve correct content',
  testFixtureStdio('test-trailing-slash', async (testPath: any) => {
    await testPath(200, '/', 'Index Page');
    await testPath(200, '/index.html', 'Index Page');
    await testPath(200, '/about.html', 'About Page');
    await testPath(200, '/sub/', 'Sub Index Page');
    await testPath(200, '/sub/index.html', 'Sub Index Page');
    await testPath(200, '/sub/another.html', 'Sub Another Page');
    await testPath(200, '/style.css', 'body { color: green }');
    await testPath(308, '/about.html/', 'Redirecting to /about.html (308)', {
      Location: '/about.html',
    });
    await testPath(308, '/style.css/', 'Redirecting to /style.css (308)', {
      Location: '/style.css',
    });
    await testPath(308, '/sub', 'Redirecting to /sub/ (308)', {
      Location: '/sub/',
    });
  })
);

test(
  '[vercel dev] should serve custom 404 when `trailingSlash: true`',
  testFixtureStdio('test-trailing-slash-custom-404', async (testPath: any) => {
    await testPath(200, '/', 'This is the home page');
    await testPath(200, '/about.html', 'The about page');
    await testPath(200, '/contact/', 'Contact Subdirectory');
    await testPath(404, '/nothing/', 'Custom 404 Page');
  })
);

test(
  '[vercel dev] test trailingSlash false serve correct content',
  testFixtureStdio('test-trailing-slash-false', async (testPath: any) => {
    await testPath(200, '/', 'Index Page');
    await testPath(200, '/index.html', 'Index Page');
    await testPath(200, '/about.html', 'About Page');
    await testPath(200, '/sub', 'Sub Index Page');
    await testPath(200, '/sub/index.html', 'Sub Index Page');
    await testPath(200, '/sub/another.html', 'Sub Another Page');
    await testPath(200, '/style.css', 'body { color: green }');
    await testPath(308, '/about.html/', 'Redirecting to /about.html (308)', {
      Location: '/about.html',
    });
    await testPath(308, '/sub/', 'Redirecting to /sub (308)', {
      Location: '/sub',
    });
    await testPath(
      308,
      '/sub/another.html/',
      'Redirecting to /sub/another.html (308)',
      {
        Location: '/sub/another.html',
      }
    );
  })
);

test(
  '[vercel dev] throw when invalid builder routes detected',
  testFixtureStdio(
    'invalid-builder-routes',
    async (testPath: any) => {
      await testPath(
        500,
        '/',
        /Route at index 0 has invalid `src` regular expression/m
      );
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] support legacy `@now` scope runtimes',
  testFixtureStdio('legacy-now-runtime', async (testPath: any) => {
    await testPath(200, '/', /A simple deployment with the Vercel API!/m);
  })
);

test(
  '[vercel dev] 00-list-directory',
  testFixtureStdio(
    '00-list-directory',
    async (testPath: any) => {
      await testPath(200, '/', /Files within/m);
      await testPath(200, '/', /test[0-3]\.txt/m);
      await testPath(200, '/', /\.well-known/m);
      await testPath(200, '/.well-known/keybase.txt', 'proof goes here');
    },
    { projectSettings: { directoryListing: true } }
  )
);

test(
  '[vercel dev] 01-node',
  testFixtureStdio('01-node', async (testPath: any) => {
    await testPath(200, '/', /A simple deployment with the Vercel API!/m);
  })
);

test(
  '[vercel dev] add a `api/fn.ts` when `api` does not exist at startup`',
  testFixtureStdio('no-api', async (_testPath: any, port: any) => {
    const directory = fixture('no-api');
    const apiDir = join(directory, 'api');

    try {
      {
        const response = await fetch(`http://localhost:${port}/api/new-file`);
        validateResponseHeaders(response);
        expect(response.status).toBe(404);
      }

      const fileContents = `
          export const config = {
            runtime: 'edge'
          }

          export default async function edge(request, event) {
            return new Response('from new file');
          }
        `;

      await mkdirp(apiDir);
      await fs.writeFile(join(apiDir, 'new-file.js'), fileContents);

      // Wait until file events have been processed
      await sleep(ms('1s'));

      {
        const response = await fetch(`http://localhost:${port}/api/new-file`);
        validateResponseHeaders(response);
        const body = await response.text();
        expect(body.trim()).toBe('from new file');
      }
    } finally {
      await fs.remove(apiDir);
    }
  })
);
