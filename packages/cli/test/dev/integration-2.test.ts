const { exec, fixture, testFixture } = require('./utils.js');

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
