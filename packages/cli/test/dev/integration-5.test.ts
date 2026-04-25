import { join } from 'path';
import ms from 'ms';
import fs, { mkdirp } from 'fs-extra';
import {
  sleep,
  fixture,
  testFixture,
  testFixtureStdio,
  validateResponseHeaders,
} from './utils';
import assert from 'assert';
import nodeFetch from 'node-fetch';

test(
  '[vercel dev] temporary directory listing',
  testFixtureStdio(
    'temporary-directory-listing',
    async (_testPath: any, port: any) => {
      const directory = fixture('temporary-directory-listing');
      await fs.unlink(join(directory, 'index.txt')).catch(() => null);

      await sleep(ms('20s'));

      const firstResponse = await nodeFetch(`http://localhost:${port}`);
      validateResponseHeaders(firstResponse);
      const body = await firstResponse.text();
      console.log(body);
      expect(firstResponse.status).toBe(404);

      await fs.writeFile(join(directory, 'index.txt'), 'hello');

      for (let i = 0; i < 20; i++) {
        const response = await nodeFetch(`http://localhost:${port}`);
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
        const response = await nodeFetch(`http://localhost:${port}`);
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
        const response = await nodeFetch(`http://localhost:${port}`);
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
    const response = await nodeFetch(`http://localhost:${port}`);
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
        console.log('stderr:', stderr.join(''));
        break;
      }
    }

    const resp1 = await nodeFetch(`http://localhost:${port}`);
    const text1 = await resp1.text();
    expect(text1.trim()).toBe('hello first');

    await fs.writeFile(join(directory, 'public', 'index.html'), 'hello second');

    await sleep(ms('3s'));

    const resp2 = await nodeFetch(`http://localhost:${port}`);
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
        /Route at index 0 has invalid `src`\/`source` regular expression/m
      );
    },
    { skipDeploy: true }
  )
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
        const response = await nodeFetch(
          `http://localhost:${port}/api/new-file`
        );
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
        const response = await nodeFetch(
          `http://localhost:${port}/api/new-file`
        );
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
        const res = await nodeFetch(`http://localhost:${port}`);
        validateResponseHeaders(res);
        const json = await res.json();
        expect(json).toHaveProperty('message', 'Hello Express!');

        const res2 = await nodeFetch(`http://localhost:${port}/test.json`);
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
        const res = await nodeFetch(`http://localhost:${port}/api/data`);
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
        const res = await nodeFetch(`http://localhost:${port}/api/data`);
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
        const res = await nodeFetch(`http://localhost:${port}/api/data`);
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
        const res = await nodeFetch(`http://localhost:${port}/api/data`);
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
        const res = await nodeFetch(`http://localhost:${port}/api/data`);
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
        const res = await nodeFetch(`http://localhost:${port}/api/data`);
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
        const res = await nodeFetch(`http://localhost:${port}/api/data`);
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
        const res = await nodeFetch(`http://localhost:${port}/api/data`);
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
        const res = await nodeFetch(`http://localhost:${port}/api/test`);
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
        const res = await nodeFetch(`http://localhost:${port}/test.json`);
        validateResponseHeaders(res);
        const json2 = await res.json();
        expect(json2).toHaveProperty('message', 'Hello Hono!');
      },
      { skipDeploy: true }
    )
  );
});

describe('[vercel dev] Multi-service with experimentalServices', () => {
  test('[vercel dev] explicit config with Next.js + 2 Python services', async () => {
    const dir = fixture('services-explicit-config');
    const { dev, port, readyResolver } = await testFixture(
      dir,
      {
        skipNpmInstall: true,
        env: {
          VERCEL_USE_EXPERIMENTAL_SERVICES: '1',
          VERCEL_USE_EXPERIMENTAL_FRAMEWORKS: '1',
        },
      },
      ['--local']
    );

    try {
      await readyResolver;

      // FastAPI service
      const fastapiRes = await nodeFetch(
        `http://localhost:${port}/api/fastapi/`
      );
      expect(fastapiRes.status).toBe(200);
      const fastapiJson = await fastapiRes.json();
      expect(fastapiJson).toHaveProperty('framework', 'fastapi');
      expect(fastapiJson).toHaveProperty('service', 'service-fastapi');

      // Flask service
      const flaskRes = await nodeFetch(`http://localhost:${port}/api/flask/`);
      expect(flaskRes.status).toBe(200);
      const flaskJson = await flaskRes.json();
      expect(flaskJson).toHaveProperty('framework', 'flask');
      expect(flaskJson).toHaveProperty('service', 'service-flask');

      // Next.js frontend
      const frontendRes = await nodeFetch(`http://localhost:${port}/`);
      expect(frontendRes.status).toBe(200);
      const frontendHtml = await frontendRes.text();
      expect(frontendHtml).toContain('Frontend - Explicit Config (Next.js)');
    } finally {
      await dev.kill();
    }
  });
});

describe('[vercel dev] Multi-service auto-detection', () => {
  test('[vercel dev] auto-detect: frontend at root + backend/', async () => {
    const dir = fixture('services-zc-root-backend');
    const { dev, port, readyResolver } = await testFixture(
      dir,
      {
        skipNpmInstall: true,
        env: {
          VERCEL_USE_EXPERIMENTAL_SERVICES: '1',
          VERCEL_USE_EXPERIMENTAL_FRAMEWORKS: '1',
        },
      },
      ['--local']
    );

    try {
      await readyResolver;

      // Backend service is routed to /_/backend
      const backendRes = await nodeFetch(`http://localhost:${port}/_/backend/`);
      validateResponseHeaders(backendRes);
      const backendJson = await backendRes.json();
      expect(backendJson).toHaveProperty(
        'message',
        'Hello from auto-detected backend!'
      );
      expect(backendJson).toHaveProperty('service', 'backend');

      // Test another backend endpoint
      const statusRes = await nodeFetch(
        `http://localhost:${port}/_/backend/status`
      );
      validateResponseHeaders(statusRes);
      const statusJson = await statusRes.json();
      expect(statusJson).toHaveProperty('status', 'ok');

      // Frontend at root
      const frontendRes = await nodeFetch(`http://localhost:${port}/`);
      validateResponseHeaders(frontendRes);
      const frontendHtml = await frontendRes.text();
      expect(frontendHtml).toContain('<h1>Auto-Detected Frontend at Root</h1>');
    } finally {
      await dev.kill();
    }
  });

  test('[vercel dev] auto-detect: frontend/ + backend/', async () => {
    const dir = fixture('services-zc-frontend-backend');
    const { dev, port, readyResolver } = await testFixture(
      dir,
      {
        skipNpmInstall: true,
        env: {
          VERCEL_USE_EXPERIMENTAL_SERVICES: '1',
          VERCEL_USE_EXPERIMENTAL_FRAMEWORKS: '1',
        },
      },
      ['--local']
    );

    try {
      await readyResolver;

      // Backend service is routed to /_/backend
      const backendRes = await nodeFetch(`http://localhost:${port}/_/backend/`);
      validateResponseHeaders(backendRes);
      const backendJson = await backendRes.json();
      expect(backendJson).toHaveProperty(
        'message',
        'Hello from backend service!'
      );
      expect(backendJson).toHaveProperty('service', 'backend');

      // Test another backend endpoint
      const dataRes = await nodeFetch(
        `http://localhost:${port}/_/backend/data`
      );
      validateResponseHeaders(dataRes);
      const dataJson = await dataRes.json();
      expect(dataJson).toHaveProperty('items');
      expect(dataJson.items).toHaveLength(3);

      // Frontend service at root
      const frontendRes = await nodeFetch(`http://localhost:${port}/`);
      validateResponseHeaders(frontendRes);
      const frontendHtml = await frontendRes.text();
      expect(frontendHtml).toContain(
        '<h1>Frontend in frontend/ directory</h1>'
      );
    } finally {
      await dev.kill();
    }
  });

  test('[vercel dev] auto-detect: frontend/ + services/', async () => {
    const dir = fixture('services-zc-frontend-services');
    const { dev, port, readyResolver } = await testFixture(
      dir,
      {
        skipNpmInstall: true,
        env: {
          VERCEL_USE_EXPERIMENTAL_SERVICES: '1',
          VERCEL_USE_EXPERIMENTAL_FRAMEWORKS: '1',
        },
      },
      ['--local']
    );

    try {
      await readyResolver;

      // FastAPI service
      const fastapiRes = await nodeFetch(
        `http://localhost:${port}/_/service-fastapi/`
      );
      expect(fastapiRes.status).toBe(200);
      const fastapiJson = await fastapiRes.json();
      expect(fastapiJson).toHaveProperty('framework', 'fastapi');
      expect(fastapiJson).toHaveProperty('service', 'service-fastapi');

      // Flask service
      const flaskRes = await nodeFetch(
        `http://localhost:${port}/_/service-flask/`
      );
      expect(flaskRes.status).toBe(200);
      const flaskJson = await flaskRes.json();
      expect(flaskJson).toHaveProperty('framework', 'flask');
      expect(flaskJson).toHaveProperty('service', 'service-flask');

      // Frontend service at root
      const frontendRes = await nodeFetch(`http://localhost:${port}/`);
      expect(frontendRes.status).toBe(200);
      const frontendHtml = await frontendRes.text();
      expect(frontendHtml).toContain(
        '<h1>Frontend with services/ directory</h1>'
      );
    } finally {
      await dev.kill();
    }
  });

  test('[vercel dev] auto-detect: apps/web/ + services/ (monorepo)', async () => {
    const dir = fixture('services-zc-apps-services');
    const { dev, port, readyResolver } = await testFixture(
      dir,
      {
        skipNpmInstall: true,
        env: {
          VERCEL_USE_EXPERIMENTAL_SERVICES: '1',
          VERCEL_USE_EXPERIMENTAL_FRAMEWORKS: '1',
        },
      },
      ['--local']
    );

    try {
      await readyResolver;

      // FastAPI service
      const fastapiRes = await nodeFetch(
        `http://localhost:${port}/_/service-fastapi/`
      );
      expect(fastapiRes.status).toBe(200);
      const fastapiJson = await fastapiRes.json();
      expect(fastapiJson).toHaveProperty('framework', 'fastapi');
      expect(fastapiJson).toHaveProperty('service', 'service-fastapi');

      // Flask service
      const flaskRes = await nodeFetch(
        `http://localhost:${port}/_/service-flask/`
      );
      expect(flaskRes.status).toBe(200);
      const flaskJson = await flaskRes.json();
      expect(flaskJson).toHaveProperty('framework', 'flask');
      expect(flaskJson).toHaveProperty('service', 'service-flask');

      // Frontend service at root (from apps/web)
      const frontendRes = await nodeFetch(`http://localhost:${port}/`);
      expect(frontendRes.status).toBe(200);
      const frontendHtml = await frontendRes.text();
      expect(frontendHtml).toContain(
        '<h1>Frontend in apps/web/ (monorepo)</h1>'
      );
    } finally {
      await dev.kill();
    }
  });

  test('[vercel dev] auto-detect: service-to-service communication', async () => {
    const dir = fixture('services-zc-service-to-service');
    const { dev, port, readyResolver } = await testFixture(
      dir,
      {
        skipNpmInstall: true,
        env: {
          VERCEL_USE_EXPERIMENTAL_SERVICES: '1',
          VERCEL_USE_EXPERIMENTAL_FRAMEWORKS: '1',
        },
      },
      ['--local']
    );

    try {
      await readyResolver;

      // Service B responds independently
      const serviceBRes = await nodeFetch(
        `http://localhost:${port}/_/service-b/`
      );
      expect(serviceBRes.status).toBe(200);
      const serviceBJson = await serviceBRes.json();
      expect(serviceBJson).toHaveProperty('service', 'service-b');
      expect(serviceBJson).toHaveProperty('message', 'Hello from service-b');

      // Service A responds independently
      const serviceARes = await nodeFetch(
        `http://localhost:${port}/_/service-a/`
      );
      expect(serviceARes.status).toBe(200);
      const serviceAJson = await serviceARes.json();
      expect(serviceAJson).toHaveProperty('service', 'service-a');

      // Service A calls Service B (service-to-service communication)
      const callRes = await nodeFetch(
        `http://localhost:${port}/_/service-a/call-service-b`
      );
      expect(callRes.status).toBe(200);
      const callJson = await callRes.json();
      expect(callJson).toHaveProperty('service', 'service-a');
      expect(callJson).toHaveProperty('from_service_b');
      expect(callJson.from_service_b).toHaveProperty('service', 'service-b');
      expect(callJson.from_service_b).toHaveProperty(
        'message',
        'Hello from service-b'
      );

      // Frontend loads and received service URL env vars
      const frontendRes = await nodeFetch(`http://localhost:${port}/`);
      expect(frontendRes.status).toBe(200);
      const frontendHtml = await frontendRes.text();
      expect(frontendHtml).toContain('<h1>Service Dashboard</h1>');
      expect(frontendHtml).toContain('/_/service-a');
      expect(frontendHtml).toContain('/_/service-b');
    } finally {
      await dev.kill();
    }
  });
});

describe('[vercel dev] Worker service', () => {
  const resultsDir = join(__dirname, 'fixtures', 'services-worker', '.results');

  beforeEach(async () => {
    await fs.remove(resultsDir);
  });

  test('[vercel dev] web send() triggers exact and wildcard worker execution', async () => {
    const dir = fixture('services-worker');
    const { dev, port, readyResolver } = await testFixture(
      dir,
      {
        skipNpmInstall: true,
        env: {
          VERCEL_USE_EXPERIMENTAL_SERVICES: '1',
          VERCEL_USE_EXPERIMENTAL_FRAMEWORKS: '1',
        },
      },
      ['--local']
    );

    try {
      await readyResolver;

      const enqueueRes = await nodeFetch(`http://localhost:${port}/enqueue`, {
        method: 'POST',
      });
      expect(enqueueRes.status).toBe(200);
      const enqueueJson = await enqueueRes.json();
      expect(enqueueJson).toHaveProperty('messageId');

      // Poll for both worker side-effect files
      const exactResultPath = join(resultsDir, 'worker_exact_result.json');
      const wildcardResultPath = join(
        resultsDir,
        'worker_wildcard_result.json'
      );
      let exactResult: any = null;
      let wildcardResult: any = null;
      for (let i = 0; i < 30; i++) {
        await sleep(500);
        if (!exactResult && (await fs.pathExists(exactResultPath))) {
          exactResult = await fs.readJson(exactResultPath);
        }
        if (!wildcardResult && (await fs.pathExists(wildcardResultPath))) {
          wildcardResult = await fs.readJson(wildcardResultPath);
        }
        if (exactResult && wildcardResult) break;
      }

      expect(exactResult).not.toBeNull();
      expect(exactResult).toHaveProperty('received', true);
      expect(exactResult.message).toHaveProperty('action', 'test');
      expect(exactResult.message).toHaveProperty('value', 42);

      expect(wildcardResult).not.toBeNull();
      expect(wildcardResult).toHaveProperty('received', true);
      expect(wildcardResult.message).toHaveProperty('action', 'test');
      expect(wildcardResult.message).toHaveProperty('value', 42);
    } finally {
      await dev.kill();
    }
  });
});

describe('[vercel dev] Schedule-triggered job service', () => {
  const resultsDir = join(__dirname, 'fixtures', 'services-cron', '.results');

  beforeEach(async () => {
    await fs.remove(resultsDir);
  });

  test('[vercel dev] trigger schedule-triggered job via proxy', async () => {
    const dir = fixture('services-cron');
    const { dev, port, readyResolver } = await testFixture(
      dir,
      {
        skipNpmInstall: true,
        env: {
          VERCEL_USE_EXPERIMENTAL_SERVICES: '1',
          VERCEL_USE_EXPERIMENTAL_FRAMEWORKS: '1',
        },
      },
      ['--local']
    );

    try {
      await readyResolver;

      // Trigger the service directly via the proxy to not wait for a minute
      const cronRes = await nodeFetch(
        `http://localhost:${port}/_svc/cron/crons/task/run_cron_task`,
        { method: 'POST' }
      );
      expect(cronRes.status).toBe(200);
      const cronJson = await cronRes.json();
      expect(cronJson).toHaveProperty('ok', true);

      const cronResultPath = join(resultsDir, 'cron_result.json');
      expect(await fs.pathExists(cronResultPath)).toBe(true);
      const cronResult = await fs.readJson(cronResultPath);
      expect(cronResult).toHaveProperty('executed', true);
    } finally {
      await dev.kill();
    }
  });
});
