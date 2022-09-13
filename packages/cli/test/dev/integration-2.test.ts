// eslint-disable-next-line
import { join } from 'path';
import ms from 'ms';
import fs, { mkdirp } from 'fs-extra';

const {
  exec,
  fetch,
  fixture,
  sleep,
  testFixture,
  testFixtureStdio,
  validateResponseHeaders,
} = require('./utils.js');

test('[vercel dev] validate redirects', async () => {
  const directory = fixture('invalid-redirects');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /Invalid vercel\.json - `redirects\[0\].statusCode` should be integer/m
  );
});

test('[vercel dev] validate headers', async () => {
  const directory = fixture('invalid-headers');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /Invalid vercel\.json - `headers\[0\].headers\[0\].value` should be string/m
  );
});

test('[vercel dev] validate mixed routes and rewrites', async () => {
  const directory = fixture('invalid-mixed-routes-rewrites');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /If `rewrites`, `redirects`, `headers`, `cleanUrls` or `trailingSlash` are used, then `routes` cannot be present./m
  );
  expect(output.stderr).toMatch(/vercel\.link\/mix-routing-props/m);
});

// Test seems unstable: It won't return sometimes.
test('[vercel dev] validate env var names', async () => {
  const directory = fixture('invalid-env-var-name');
  const { dev } = await testFixture(directory, { stdio: 'pipe' });

  try {
    let stderr = '';
    dev.stderr.setEncoding('utf8');

    await new Promise<void>((resolve, reject) => {
      dev.stderr.on('data', (b: any) => {
        stderr += b.toString();

        if (
          stderr.includes('Ignoring env var "1" because name is invalid') &&
          stderr.includes(
            'Ignoring build env var "_a" because name is invalid'
          ) &&
          stderr.includes(
            'Env var names must start with letters, and can only contain alphanumeric characters and underscores'
          )
        ) {
          resolve();
        }
      });

      dev.on('error', reject);
      dev.on('exit', resolve);
    });
  } finally {
    dev.kill('SIGTERM');
  }
});

test(
  '[vercel dev] test rewrites with segments serve correct content',
  testFixtureStdio('test-rewrites-with-segments', async (testPath: any) => {
    await testPath(200, '/api/users/first', 'first');
    await testPath(200, '/api/fourty-two', '42');
    await testPath(200, '/rand', '42');
    await testPath(200, '/api/dynamic', 'dynamic');
    await testPath(404, '/api');
  })
);

test(
  '[vercel dev] test rewrites serve correct content',
  testFixtureStdio('test-rewrites', async (testPath: any) => {
    await testPath(200, '/hello', 'Hello World');
  })
);

test(
  '[vercel dev] test rewrites and redirects serve correct external content',
  testFixtureStdio(
    'test-external-rewrites-and-redirects',
    async (testPath: any) => {
      const vcRobots = `https://vercel.com/robots.txt`;
      await testPath(200, '/rewrite', /User-Agent: \*/m);
      await testPath(308, '/redirect', `Redirecting to ${vcRobots} (308)`, {
        Location: vcRobots,
      });
      await testPath(307, '/tempRedirect', `Redirecting to ${vcRobots} (307)`, {
        Location: vcRobots,
      });
    }
  )
);

test(
  '[vercel dev] test rewrites and redirects is case sensitive',
  testFixtureStdio('test-routing-case-sensitive', async (testPath: any) => {
    await testPath(200, '/Path', 'UPPERCASE');
    await testPath(200, '/path', 'lowercase');
    await testPath(308, '/GoTo', 'Redirecting to /upper.html (308)', {
      Location: '/upper.html',
    });
    await testPath(308, '/goto', 'Redirecting to /lower.html (308)', {
      Location: '/lower.html',
    });
  })
);

test(
  '[vercel dev] test cleanUrls serve correct content',
  testFixtureStdio('test-clean-urls', async (testPath: any) => {
    await testPath(200, '/', 'Index Page');
    await testPath(200, '/about', 'About Page');
    await testPath(200, '/sub', 'Sub Index Page');
    await testPath(200, '/sub/another', 'Sub Another Page');
    await testPath(200, '/style.css', 'body { color: green }');
    await testPath(308, '/index.html', 'Redirecting to / (308)', {
      Location: '/',
    });
    await testPath(308, '/about.html', 'Redirecting to /about (308)', {
      Location: '/about',
    });
    await testPath(308, '/sub/index.html', 'Redirecting to /sub (308)', {
      Location: '/sub',
    });
    await testPath(
      308,
      '/sub/another.html',
      'Redirecting to /sub/another (308)',
      { Location: '/sub/another' }
    );
  })
);

test(
  '[vercel dev] test cleanUrls serve correct content when using `outputDirectory`',
  testFixtureStdio(
    'test-clean-urls-with-output-directory',
    async (testPath: any) => {
      await testPath(200, '/', 'Index Page');
      await testPath(200, '/about', 'About Page');
      await testPath(200, '/sub', 'Sub Index Page');
      await testPath(200, '/sub/another', 'Sub Another Page');
      await testPath(200, '/style.css', 'body { color: green }');
      await testPath(308, '/index.html', 'Redirecting to / (308)', {
        Location: '/',
      });
      await testPath(308, '/about.html', 'Redirecting to /about (308)', {
        Location: '/about',
      });
      await testPath(308, '/sub/index.html', 'Redirecting to /sub (308)', {
        Location: '/sub',
      });
      await testPath(
        308,
        '/sub/another.html',
        'Redirecting to /sub/another (308)',
        { Location: '/sub/another' }
      );
    }
  )
);

test(
  '[vercel dev] should serve custom 404 when `cleanUrls: true`',
  testFixtureStdio('test-clean-urls-custom-404', async (testPath: any) => {
    await testPath(200, '/', 'This is the home page');
    await testPath(200, '/about', 'The about page');
    await testPath(200, '/contact/me', 'Contact Me Subdirectory');
    await testPath(404, '/nothing', 'Custom 404 Page');
    await testPath(404, '/nothing/', 'Custom 404 Page');
  })
);

test(
  '[vercel dev] test cleanUrls and trailingSlash serve correct content',
  testFixtureStdio('test-clean-urls-trailing-slash', async (testPath: any) => {
    await testPath(200, '/', 'Index Page');
    await testPath(200, '/about/', 'About Page');
    await testPath(200, '/sub/', 'Sub Index Page');
    await testPath(200, '/sub/another/', 'Sub Another Page');
    await testPath(200, '/style.css', 'body { color: green }');
    //TODO: fix this test so that location is `/` instead of `//`
    //await testPath(308, '/index.html', 'Redirecting to / (308)', { Location: '/' });
    await testPath(308, '/about.html', 'Redirecting to /about/ (308)', {
      Location: '/about/',
    });
    await testPath(308, '/sub/index.html', 'Redirecting to /sub/ (308)', {
      Location: '/sub/',
    });
    await testPath(
      308,
      '/sub/another.html',
      'Redirecting to /sub/another/ (308)',
      {
        Location: '/sub/another/',
      }
    );
  })
);

test(
  '[vercel dev] test cors headers work with OPTIONS',
  testFixtureStdio('test-cors-routes', async (testPath: any) => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, Accept, Content-Length, Origin, User-Agent',
      'Access-Control-Allow-Methods':
        'GET, POST, OPTIONS, HEAD, PATCH, PUT, DELETE',
    };
    await testPath(200, '/', 'status api', headers, { method: 'GET' });
    await testPath(200, '/', 'status api', headers, { method: 'POST' });
    await testPath(200, '/api/status.js', 'status api', headers, {
      method: 'GET',
    });
    await testPath(200, '/api/status.js', 'status api', headers, {
      method: 'POST',
    });
    await testPath(204, '/', '', headers, { method: 'OPTIONS' });
    await testPath(204, '/api/status.js', '', headers, { method: 'OPTIONS' });
  })
);

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
            runtime: 'experimental-edge'
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
