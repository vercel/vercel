const { exec, fixture, testFixture, testFixtureStdio } = require('./utils.js');

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

test('[vercel dev] validate env var names', async () => {
  const directory = fixture('invalid-env-var-name');
  const { dev } = await testFixture(directory, { encoding: 'utf8' });

  try {
    let stderr = '';

    await new Promise<void>((resolve, reject) => {
      dev.stderr.on('data', (b: string) => {
        stderr += b;
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
      dev.on('close', resolve);
    });
  } finally {
    await dev.kill();
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
