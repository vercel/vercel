import { exec, fixture, testFixtureStdio } from './utils';

test(
  '[vercel dev] validate routes that use `check: true`',
  testFixtureStdio('routes-check-true', async (testPath: any) => {
    await testPath(200, '/blog/post', 'Blog Home');
  })
);

test(
  '[vercel dev] validate routes that use `check: true` and `status` code',
  testFixtureStdio('routes-check-true-status', async (testPath: any) => {
    await testPath(403, '/secret');
    await testPath(200, '/post', 'This is a post.');
    await testPath(200, '/post.html', 'This is a post.');
  })
);

// This looks like a cdn or proxy issue we're experiencing right now
test.skip(
  '[vercel dev] validate routes that use custom 404 page',
  testFixtureStdio('routes-custom-404', async (testPath: any) => {
    await testPath(200, '/', 'Home Page');
    await testPath(404, '/nothing', 'Custom User 404');
    await testPath(404, '/exact', 'Exact Custom 404');
    await testPath(200, '/api/hello', 'Hello');
    await testPath(404, '/api/nothing', 'Custom User 404');
  })
);

test(
  '[vercel dev] handles miss after route',
  testFixtureStdio('handle-miss-after-route', async (testPath: any) => {
    await testPath(200, '/post', 'Blog Post Page', {
      test: '1',
      override: 'one',
    });
  })
);

test(
  '[vercel dev] handles miss after rewrite',
  testFixtureStdio('handle-miss-after-rewrite', async (testPath: any) => {
    await testPath(200, '/post', 'Blog Post Page', {
      test: '1',
      override: 'one',
    });
    await testPath(200, '/blog/post', 'Blog Post Page', {
      test: '1',
      override: 'two',
    });
    await testPath(404, '/blog/about.html', undefined, {
      test: '1',
      override: 'two',
    });
  })
);

test(
  '[vercel dev] does not display directory listing after 404',
  testFixtureStdio('handle-miss-hide-dir-list', async (testPath: any) => {
    await testPath(404, '/post');
    await testPath(200, '/post/one.html', 'First Post');
  })
);

test(
  '[vercel dev] should preserve query string even after miss phase',
  testFixtureStdio('handle-miss-querystring', async (testPath: any) => {
    await testPath(200, '/', 'Index Page');
    if (process.env.CI && process.platform === 'darwin') {
      console.log('Skipping since GH Actions hangs for some reason');
    } else {
      await testPath(200, '/echo/first/second', 'a=first,b=second');
      await testPath(200, '/functions/echo.js?a=one&b=two', 'a=one,b=two');
    }
  })
);

test(
  '[vercel dev] handles hit after handle: filesystem',
  testFixtureStdio('handle-hit-after-fs', async (testPath: any) => {
    await testPath(200, '/blog.html', 'Blog Page', { test: '1' });
  })
);

test(
  '[vercel dev] handles hit after dest',
  testFixtureStdio('handle-hit-after-dest', async (testPath: any) => {
    await testPath(200, '/post', 'Blog Post', { test: '1', override: 'one' });
  })
);

test(
  '[vercel dev] handles hit after rewrite',
  testFixtureStdio('handle-hit-after-rewrite', async (testPath: any) => {
    await testPath(200, '/post', 'Blog Post', { test: '1', override: 'one' });
  })
);

test(
  '[vercel dev] should serve the public directory and api functions',
  testFixtureStdio('public-and-api', async (testPath: any) => {
    await testPath(200, '/', 'This is the home page');
    await testPath(200, '/about.html', 'This is the about page');
    await testPath(200, '/.well-known/humans.txt', 'We come in peace');
    await testPath(200, '/api/date', /current date/);
    await testPath(200, '/api/rand', /random number/);
    await testPath(200, '/api/rand.js', /random number/);
    await testPath(404, '/api/api', /NOT_FOUND/m);
    await testPath(404, '/nothing', /Custom 404 Page/);
  })
);

test(
  '[vercel dev] should allow user rewrites for path segment files',
  testFixtureStdio('test-zero-config-rewrite', async (testPath: any) => {
    await testPath(404, '/');
    await testPath(200, '/echo/1', '{"id":"1"}', {
      'Access-Control-Allow-Origin': '*',
    });
    await testPath(200, '/echo/2', '{"id":"2"}', {
      'Access-Control-Allow-Headers': '*',
    });
  })
);

test('[vercel dev] validate builds', async () => {
  const directory = fixture('invalid-builds');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /Invalid vercel\.json - `builds\[0\].src` should be string/m
  );
});

test('[vercel dev] validate routes', async () => {
  const directory = fixture('invalid-routes');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /Invalid vercel\.json - `routes\[0\].src` should be string/m
  );
});

test('[vercel dev] validate cleanUrls', async () => {
  const directory = fixture('invalid-clean-urls');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /Invalid vercel\.json - `cleanUrls` should be boolean/m
  );
});

test('[vercel dev] validate trailingSlash', async () => {
  const directory = fixture('invalid-trailing-slash');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /Invalid vercel\.json - `trailingSlash` should be boolean/m
  );
});

test('[vercel dev] validate rewrites', async () => {
  const directory = fixture('invalid-rewrites');
  const output = await exec(directory);

  expect(output.exitCode).toBe(1);
  expect(output.stderr).toMatch(
    /Invalid vercel\.json - `rewrites\[0\].destination` should be string/m
  );
});

test(
  '[vercel dev] should correctly proxy to vite dev',
  testFixtureStdio(
    'vite-dev',
    async (testPath: any) => {
      const url = '/src/App.vue?vue&type=style&index=0&lang.css';
      // The first request should return the HTML template
      await testPath(200, url, /<template>/gm);
      // The second request should return the HMR JS
      await testPath(200, url, /__vite__createHotContext/gm);
      // Home page should always return HTML
      await testPath(200, '/', /<title>Vite App<\/title>/gm);
    },
    { skipDeploy: true }
  )
);
