import { join } from 'path';
import ms from 'ms';
import fs, { mkdirp } from 'fs-extra';
import {
  sleep,
  fetch,
  fixture,
  testFixture,
  testFixtureStdio,
  validateResponseHeaders,
} from './utils';
import assert from 'assert';

test(
  '[vercel dev] temporary directory listing',
  testFixtureStdio(
    'temporary-directory-listing',
    async (_testPath: any, port: any) => {
      const directory = fixture('temporary-directory-listing');
      await fs.unlink(join(directory, 'index.txt')).catch(() => null);

      await sleep(ms('20s'));

      const firstResponse = await fetch(`http://localhost:${port}`);
      validateResponseHeaders(firstResponse);
      const body = await firstResponse.text();
      // eslint-disable-next-line no-console
      console.log(body);
      expect(firstResponse.status).toBe(404);

      await fs.writeFile(join(directory, 'index.txt'), 'hello');

      for (let i = 0; i < 20; i++) {
        const response = await fetch(`http://localhost:${port}`);
        validateResponseHeaders(response);

        if (response.status === 200) {
          const body = await response.text();
          expect(body).toBe('hello');
        }

        await sleep(ms('1s'));
      }
    },
    { skipDeploy: true }
  )
);

test('[vercel dev] add a `package.json` to trigger `@vercel/static-build`', async () => {
  const directory = fixture('trigger-static-build');

  await fs.unlink(join(directory, 'package.json')).catch(() => null);

  await fs.unlink(join(directory, 'public', 'index.txt')).catch(() => null);

  await fs.rmdir(join(directory, 'public')).catch(() => null);

  const tester = testFixtureStdio(
    'trigger-static-build',
    async (_testPath: any, port: any) => {
      {
        const response = await fetch(`http://localhost:${port}`);
        validateResponseHeaders(response);
        const body = await response.text();
        expect(body.trim()).toBe('hello:index.txt');
      }

      const rnd = Math.random().toString();
      const pkg = {
        private: true,
        scripts: { build: `mkdir -p public && echo ${rnd} > public/index.txt` },
      };

      await fs.writeFile(join(directory, 'package.json'), JSON.stringify(pkg));

      // Wait until file events have been processed
      await sleep(ms('2s'));

      {
        const response = await fetch(`http://localhost:${port}`);
        validateResponseHeaders(response);
        const body = await response.text();
        expect(body.trim()).toBe(rnd);
      }
    },
    { skipDeploy: true }
  );

  await tester();
});

test('[vercel dev] no build matches warning', async () => {
  const directory = fixture('no-build-matches');
  const { dev } = await testFixture(directory, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    // start `vercel dev` detached in child_process
    dev.unref();

    assert(dev.stderr);
    dev.stderr.setEncoding('utf8');
    await new Promise<void>(resolve => {
      assert(dev.stderr);
      dev.stderr.on('data', (str: string) => {
        if (str.includes('did not match any source files')) {
          resolve();
        }
      });
    });
  } finally {
    await dev.kill();
  }
});

test(
  '[vercel dev] do not recursivly check the path',
  testFixtureStdio('handle-filesystem-missing', async (testPath: any) => {
    await testPath(200, '/', /hello/m);
    await testPath(404, '/favicon.txt');
  })
);

test('[vercel dev] render warning for empty cwd dir', async () => {
  const directory = fixture('empty');
  const { dev, port } = await testFixture(directory, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    dev.unref();

    // Monitor `stderr` for the warning
    assert(dev.stderr);
    dev.stderr.setEncoding('utf8');
    const msg = 'There are no files inside your deployment.';
    await new Promise<void>(resolve => {
      assert(dev.stderr);
      dev.stderr.on('data', (str: string) => {
        if (str.includes(msg)) {
          resolve();
        }
      });
    });

    // Issue a request to ensure a 404 response
    await sleep(ms('3s'));
    const response = await fetch(`http://localhost:${port}`);
    validateResponseHeaders(response);
    expect(response.status).toBe(404);
  } finally {
    await dev.kill();
  }
});

test('[vercel dev] do not rebuild for changes in the output directory', async () => {
  const directory = fixture('output-is-source');

  const { dev, port } = await testFixture(directory, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    dev.unref();

    const stderr: any = [];
    const start = Date.now();

    assert(dev.stderr);
    dev.stderr.on('data', (str: any) => stderr.push(str));

    while (stderr.join('').includes('Ready') === false) {
      await sleep(ms('3s'));

      if (Date.now() - start > ms('30s')) {
        // eslint-disable-next-line no-console
        console.log('stderr:', stderr.join(''));
        break;
      }
    }

    const resp1 = await fetch(`http://localhost:${port}`);
    const text1 = await resp1.text();
    expect(text1.trim()).toBe('hello first');

    await fs.writeFile(join(directory, 'public', 'index.html'), 'hello second');

    await sleep(ms('3s'));

    const resp2 = await fetch(`http://localhost:${port}`);
    const text2 = await resp2.text();
    expect(text2.trim()).toBe('hello second');
  } finally {
    await dev.kill();
  }
});

test(
  '[vercel dev] test cleanUrls serve correct content',
  testFixtureStdio('test-clean-urls', async (testPath: any) => {
    await testPath(200, '/', 'Index Page');
    await testPath(200, '/about', 'About Page');
    await testPath(200, '/sub', 'Sub Index Page');
    await testPath(200, '/sub/another', 'Sub Another Page');
    await testPath(200, '/style.css', 'body { color: green }');
    await testPath(308, '/index.html', 'Redirecting...', {
      Location: '/',
    });
    await testPath(308, '/about.html', 'Redirecting...', {
      Location: '/about',
    });
    await testPath(308, '/sub/index.html', 'Redirecting...', {
      Location: '/sub',
    });
    await testPath(308, '/sub/another.html', 'Redirecting...', {
      Location: '/sub/another',
    });
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
      await testPath(308, '/index.html', 'Redirecting...', {
        Location: '/',
      });
      await testPath(308, '/about.html', 'Redirecting...', {
        Location: '/about',
      });
      await testPath(308, '/sub/index.html', 'Redirecting...', {
        Location: '/sub',
      });
      await testPath(308, '/sub/another.html', 'Redirecting...', {
        Location: '/sub/another',
      });
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
    //await testPath(308, '/index.html', 'Redirecting...', { Location: '/' });
    await testPath(308, '/about.html', 'Redirecting...', {
      Location: '/about/',
    });
    await testPath(308, '/sub/index.html', 'Redirecting...', {
      Location: '/sub/',
    });
    await testPath(308, '/sub/another.html', 'Redirecting...', {
      Location: '/sub/another/',
    });
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
    await testPath(308, '/about.html/', 'Redirecting...', {
      Location: '/about.html',
    });
    await testPath(308, '/style.css/', 'Redirecting...', {
      Location: '/style.css',
    });
    await testPath(308, '/sub', 'Redirecting...', {
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
    await testPath(308, '/about.html/', 'Redirecting...', {
      Location: '/about.html',
    });
    await testPath(308, '/sub/', 'Redirecting...', {
      Location: '/sub',
    });
    await testPath(308, '/sub/another.html/', 'Redirecting...', {
      Location: '/sub/another.html',
    });
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

// n.b. this test requires the project 00-list-directory to have directory listing
// enabled at 00-list-directory/settings/advanced
test(
  '[vercel dev] 00-list-directory',
  testFixtureStdio('00-list-directory', async (testPath: any) => {
    await testPath(200, '/', /Files within/m);
    await testPath(200, '/', /test[0-3]\.txt/m);
    await testPath(200, '/', /\.well-known/m);
    await testPath(200, '/.well-known/keybase.txt', 'proof goes here');
  })
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

describe('[vercel dev] Express', () => {
  test(
    '[vercel dev] Express no export',
    testFixtureStdio(
      'express-no-export',
      async (_testPath: any, port: any) => {
        const res = await fetch(`http://localhost:${port}`);
        validateResponseHeaders(res);
        const json = await res.json();
        expect(json).toHaveProperty('message', 'Hello Express!');

        const res2 = await fetch(`http://localhost:${port}/test.json`);
        validateResponseHeaders(res2);
        const json2 = await res2.json();
        expect(json2).toHaveProperty('message', 'Hello Express!');
      },
      { skipDeploy: true }
    )
  );
});

describe('[vercel dev] ESM edge functions', () => {
  test(
    '[vercel dev] ESM .js type=module',
    testFixtureStdio(
      'esm-js-edge-module',
      async (_testPath: any, port: any) => {
        const res = await fetch(`http://localhost:${port}/api/data`);
        validateResponseHeaders(res);
        const json = await res.json();
        expect(json).toHaveProperty('isLeapYear');
      },
      { skipDeploy: true }
    )
  );

  test(
    '[vercel dev] ESM .ts type=module',
    testFixtureStdio(
      'esm-ts-edge-module',
      async (_testPath: any, port: any) => {
        const res = await fetch(`http://localhost:${port}/api/data`);
        validateResponseHeaders(res);
        const json = await res.json();
        expect(json).toHaveProperty('isLeapYear');
      },
      { skipDeploy: true }
    )
  );

  test(
    '[vercel dev] ESM .js type=commonjs',
    testFixtureStdio(
      'esm-js-edge-no-module',
      async (_testPath: any, port: any) => {
        const res = await fetch(`http://localhost:${port}/api/data`);
        validateResponseHeaders(res);
        const json = await res.json();
        expect(json).toHaveProperty('isLeapYear');
      },
      { skipDeploy: true }
    )
  );

  test(
    '[vercel dev] ESM .ts type=commonjs',
    testFixtureStdio(
      'esm-ts-edge-no-module',
      async (_testPath: any, port: any) => {
        const res = await fetch(`http://localhost:${port}/api/data`);
        validateResponseHeaders(res);
        const json = await res.json();
        expect(json).toHaveProperty('isLeapYear');
      },
      { skipDeploy: true }
    )
  );
});

describe('[vercel dev] ESM serverless functions', () => {
  test(
    '[vercel dev] ESM .js type=module',
    testFixtureStdio(
      'esm-js-nodejs-module',
      async (_testPath: any, port: any) => {
        const res = await fetch(`http://localhost:${port}/api/data`);
        validateResponseHeaders(res);
        const json = await res.json();
        expect(json).toHaveProperty('isLeapYear');
      },
      { skipDeploy: true }
    )
  );

  test(
    '[vercel dev] ESM .ts type=module',
    testFixtureStdio(
      'esm-ts-nodejs-module',
      async (_testPath: any, port: any) => {
        const res = await fetch(`http://localhost:${port}/api/data`);
        validateResponseHeaders(res);
        const json = await res.json();
        expect(json).toHaveProperty('isLeapYear');
      },
      { skipDeploy: true }
    )
  );

  test(
    '[vercel dev] ESM .js type=commonjs',
    testFixtureStdio(
      'esm-js-nodejs-no-module',
      async (_testPath: any, port: any) => {
        const res = await fetch(`http://localhost:${port}/api/data`);
        validateResponseHeaders(res);
        const json = await res.json();
        expect(json).toHaveProperty('isLeapYear');
      },
      { skipDeploy: true }
    )
  );

  test(
    '[vercel dev] ESM .ts type=commonjs',
    testFixtureStdio(
      'esm-ts-nodejs-no-module',
      async (_testPath: any, port: any) => {
        const res = await fetch(`http://localhost:${port}/api/data`);
        validateResponseHeaders(res);
        const json = await res.json();
        expect(json).toHaveProperty('isLeapYear');
      },
      { skipDeploy: true }
    )
  );

  test(
    '[vercel dev] TypeScript importing another TS file, type=commonjs',
    testFixtureStdio(
      'vercel-ts-test',
      async (_testPath: any, port: number) => {
        const res = await fetch(`http://localhost:${port}/api/test`);
        validateResponseHeaders(res);
        const text = await res.text();
        expect(text).toEqual('Hello, Batman!');
      },
      { skipDeploy: true }
    )
  );
});

describe('[vercel dev] Hono', () => {
  test(
    '[vercel dev] Hono with public folder',
    testFixtureStdio(
      'hono-no-export',
      async (_testPath: any, port: number) => {
        const res = await fetch(`http://localhost:${port}/test.json`);
        validateResponseHeaders(res);
        const json2 = await res.json();
        expect(json2).toHaveProperty('message', 'Hello Hono!');
      },
      { skipDeploy: true }
    )
  );
});
