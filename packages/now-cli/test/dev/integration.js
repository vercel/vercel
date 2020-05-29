import ms from 'ms';
import fs from 'fs-extra';
import test from 'ava';
import { join, resolve, delimiter } from 'path';
import _execa from 'execa';
import fetch from 'node-fetch';
import sleep from 'then-sleep';
import retry from 'async-retry';
import { satisfies } from 'semver';
import { getDistTag } from '../../src/util/get-dist-tag';
import { version as cliVersion } from '../../package.json';
import { fetchTokenWithRetry } from '../../../../test/lib/deployment/now-deploy';

const isCanary = () => getDistTag(cliVersion) === 'canary';

let port = 3000;

const binaryPath = resolve(__dirname, `../../scripts/start.js`);
const fixture = name => join('test', 'dev', 'fixtures', name);
const fixtureAbsolute = name => join(__dirname, 'fixtures', name);

let processCounter = 0;
const processList = new Map();

function execa(...args) {
  const procId = ++processCounter;
  const child = _execa(...args);

  processList.set(procId, child);
  child.on('exit', () => processList.delete(procId));

  return child;
}

function fetchWithRetry(url, retries = 3, opts = {}) {
  return retry(
    async () => {
      const res = await fetch(url, opts);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Failed to fetch ${url} with status ${res.status}:` +
            `\n\n${text}\n\n`
        );
      }

      return res;
    },
    {
      retries,
      factor: 1,
    }
  );
}

function createResolver() {
  let resolver;
  const p = new Promise(res => (resolver = res));
  p.resolve = resolver;
  return p;
}

function formatOutput({ stderr, stdout }) {
  return `Received:\n"${stderr}"\n"${stdout}"`;
}

function printOutput(fixture, stdout, stderr) {
  const lines = (
    `\nOutput for "${fixture}"\n` +
    `\n----- stdout -----\n` +
    stdout +
    `\n----- stderr -----\n` +
    stderr
  ).split('\n');

  const getPrefix = nr => {
    return nr === 0 ? '╭' : nr === lines.length - 1 ? '╰' : '│';
  };

  console.log(
    lines.map((line, index) => ` ${getPrefix(index)} ${line}`).join('\n')
  );
}

function shouldSkip(t, name, versions) {
  if (!satisfies(process.version, versions)) {
    console.log(`Skipping "${name}" because it requires "${versions}".`);
    t.pass();
    return true;
  }

  return false;
}

function validateResponseHeaders(t, res) {
  if (res.status < 500) {
    t.truthy(res.headers.get('x-vercel-id'));
    t.truthy(res.headers.get('cache-control').length > 0);
  }
}

async function exec(directory, args = []) {
  return execa(binaryPath, ['dev', directory, ...args], {
    reject: false,
    shell: true,
    env: { __VERCEL_SKIP_DEV_CMD: 1 },
  });
}

async function runNpmInstall(fixturePath) {
  if (await fs.exists(join(fixturePath, 'package.json'))) {
    await execa('yarn', ['install'], {
      cwd: fixturePath,
      shell: true,
    });
  }
}

async function getPackedBuilderPath(builderDirName) {
  const packagePath = join(__dirname, '..', '..', '..', builderDirName);
  const output = await execa('npm', ['pack'], {
    cwd: packagePath,
    shell: true,
  });

  if (output.exitCode !== 0 || output.stdout.trim() === '') {
    throw new Error(
      `Failed to pack ${builderDirName}: ${formatOutput(output)}`
    );
  }

  return join(packagePath, output.stdout.trim());
}

async function testPath(
  t,
  origin,
  status,
  path,
  expectedText,
  headers = {},
  method = 'GET'
) {
  const opts = { redirect: 'manual-dont-change', method };
  const url = `${origin}${path}`;
  const res = await fetch(url, opts);
  const msg = `Testing response from ${method} ${url}`;
  console.log(msg);
  t.is(res.status, status, msg);
  validateResponseHeaders(t, res);
  if (typeof expectedText === 'string') {
    const actualText = await res.text();
    t.is(actualText.trim(), expectedText.trim(), msg);
  } else if (expectedText instanceof RegExp) {
    const actualText = await res.text();
    expectedText.lastIndex = 0; // reset since we test twice
    t.regex(actualText, expectedText);
  }
  if (headers) {
    Object.entries(headers).forEach(([key, expectedValue]) => {
      let actualValue = res.headers.get(key);
      if (key.toLowerCase() === 'location' && actualValue === '//') {
        // HACK: `node-fetch` has strang behavior for location header so fix it
        // with `manual-dont-change` opt and convert double slash to single.
        // See https://github.com/node-fetch/node-fetch/issues/417#issuecomment-587233352
        actualValue = '/';
      }
      t.is(actualValue, expectedValue, msg);
    });
  }
}

async function testFixture(directory, opts = {}, args = []) {
  await runNpmInstall(directory);

  const dev = execa(
    binaryPath,
    ['dev', directory, '-l', String(port), ...args],
    {
      reject: false,
      detached: true,
      shell: true,
      stdio: 'pipe',
      ...opts,
      env: { ...opts.env, __VERCEL_SKIP_DEV_CMD: 1 },
    }
  );

  const stdoutList = [];
  const stderrList = [];

  const exitResolver = createResolver();

  dev.stderr.on('data', data => stderrList.push(Buffer.from(data)));
  dev.stdout.on('data', data => stdoutList.push(Buffer.from(data)));

  let printedOutput = false;

  dev.on('exit', () => {
    if (!printedOutput) {
      const stdout = Buffer.concat(stdoutList).toString();
      const stderr = Buffer.concat(stderrList).toString();
      printOutput(directory, stdout, stderr);
      printedOutput = true;
    }
    exitResolver.resolve();
  });

  dev.on('error', () => {
    if (!printedOutput) {
      const stdout = Buffer.concat(stdoutList).toString();
      const stderr = Buffer.concat(stderrList).toString();
      printOutput(directory, stdout, stderr);
      printedOutput = true;
    }
    exitResolver.resolve();
  });

  dev._kill = dev.kill;
  dev.kill = async (...args) => {
    dev._kill(...args);
    await exitResolver;
  };

  return {
    dev,
    port,
  };
}

function testFixtureStdio(
  directory,
  fn,
  { expectedCode = 0, skipDeploy } = {}
) {
  return async t => {
    const cwd = fixtureAbsolute(directory);
    const token = await fetchTokenWithRetry();
    let deploymentUrl;

    // Deploy fixture and link project
    if (!skipDeploy) {
      const project = join(cwd, '.vercel', 'project.json');
      if (await fs.exists(project)) {
        await fs.unlink(project);
      }
      const gitignore = join(cwd, '.gitignore');
      const gitignoreOrig = await fs.exists(gitignore);
      let { stdout, stderr, exitCode } = await execa(
        binaryPath,
        ['-t', token, '--confirm', '--public', '--no-clipboard', '--debug'],
        { cwd, reject: false }
      );
      console.log({ stdout, stderr, exitCode });
      if (!gitignoreOrig && (await fs.exists(gitignore))) {
        await fs.unlink(gitignore);
      }
      t.is(exitCode, expectedCode);
      if (expectedCode === 0) {
        deploymentUrl = new URL(stdout).host;
      }
    }

    // Start dev
    let dev;

    await runNpmInstall(cwd);

    const stdoutList = [];
    const stderrList = [];

    const readyResolver = createResolver();
    const exitResolver = createResolver();

    try {
      let stderr = '';
      let printedOutput = false;

      const env = skipDeploy
        ? { ...process.env, __VERCEL_SKIP_DEV_CMD: 1 }
        : process.env;
      dev = execa(binaryPath, ['dev', '-l', port, '-t', token, '--debug'], {
        cwd,
        env,
      });

      dev.stdout.pipe(process.stdout);
      dev.stderr.pipe(process.stderr);

      dev.stdout.on('data', data => {
        stdoutList.push(data);
      });

      dev.stderr.on('data', data => {
        stderrList.push(data);

        stderr += data.toString();
        if (stderr.includes('Ready! Available at')) {
          readyResolver.resolve();
        }

        if (stderr.includes(`Requested port ${port} is already in use`)) {
          dev.kill('SIGTERM');
          throw new Error(
            `Failed for "${directory}" with port ${port} with stderr "${stderr}".`
          );
        }

        if (stderr.includes('Command failed') || stderr.includes('Error!')) {
          dev.kill('SIGTERM');
          throw new Error(`Failed for "${directory}" with stderr "${stderr}".`);
        }
      });

      dev.on('exit', () => {
        if (!printedOutput) {
          const stdout = Buffer.concat(stdoutList).toString();
          const stderr = Buffer.concat(stderrList).toString();
          printOutput(directory, stdout, stderr);
          printedOutput = true;
        }
        exitResolver.resolve();
      });

      dev.on('error', () => {
        if (!printedOutput) {
          const stdout = Buffer.concat(stdoutList).toString();
          const stderr = Buffer.concat(stderrList).toString();
          printOutput(directory, stdout, stderr);
          printedOutput = true;
        }
        exitResolver.resolve();
      });

      await readyResolver;

      const helperTestPath = async (...args) => {
        if (!skipDeploy) {
          await testPath(t, `https://${deploymentUrl}`, ...args);
        }
        await testPath(t, `http://localhost:${port}`, ...args);
      };
      await fn(helperTestPath, t, port);
    } finally {
      dev.kill('SIGTERM');
      await exitResolver;
    }
  };
}

test.beforeEach(() => {
  port = ++port;
});

test.afterEach(async () => {
  await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Array.from(processList).map(([_procId, proc]) => {
      if (proc.killed === false) {
        console.log(
          `killing process ${proc.pid} "${proc.spawnargs.join(' ')}"`
        );

        try {
          process.kill(proc.pid, 'SIGTERM');
        } catch (err) {
          // Was already killed
          if (err.errno !== 'ESRCH') {
            throw err;
          }
        }
      }
    })
  );
});

test(
  '[vercel dev] validate routes that use `check: true`',
  testFixtureStdio('routes-check-true', async testPath => {
    await testPath(200, '/blog/post', 'Blog Home');
  })
);

test(
  '[vercel dev] validate routes that use `check: true` and `status` code',
  testFixtureStdio('routes-check-true-status', async testPath => {
    await testPath(403, '/secret');
    await testPath(200, '/post', 'This is a post.');
    await testPath(200, '/post.html', 'This is a post.');
  })
);

test(
  '[vercel dev] handles miss after route',
  testFixtureStdio('handle-miss-after-route', async testPath => {
    await testPath(200, '/post', 'Blog Post Page', {
      test: '1',
      override: 'one',
    });
  })
);

test(
  '[vercel dev] handles miss after rewrite',
  testFixtureStdio('handle-miss-after-rewrite', async testPath => {
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
/*
test(
  '[vercel dev] displays directory listing after miss',
  testFixtureStdio('handle-miss-display-dir-list', async (testPath) => {
    await testPath(404, '/post', /one.html/m);
  })
);
*/

test(
  '[vercel dev] does not display directory listing after 404',
  testFixtureStdio('handle-miss-hide-dir-list', async testPath => {
    await testPath(404, '/post');
    await testPath(200, '/post/one.html', 'First Post');
  })
);

test(
  '[vercel dev] should preserve query string even after miss phase',
  testFixtureStdio('handle-miss-querystring', async testPath => {
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
  testFixtureStdio('handle-hit-after-fs', async testPath => {
    await testPath(200, '/blog.html', 'Blog Page', { test: '1' });
  })
);

test(
  '[vercel dev] handles hit after dest',
  testFixtureStdio('handle-hit-after-dest', async testPath => {
    await testPath(200, '/post', 'Blog Post', { test: '1', override: 'one' });
  })
);

test(
  '[vercel dev] handles hit after rewrite',
  testFixtureStdio('handle-hit-after-rewrite', async testPath => {
    await testPath(200, '/post', 'Blog Post', { test: '1', override: 'one' });
  })
);

test(
  '[vercel dev] should serve the public directory and api functions',
  testFixtureStdio('public-and-api', async testPath => {
    await testPath(200, '/', 'This is the home page');
    await testPath(200, '/about.html', 'This is the about page');
    await testPath(200, '/api/date', /current date/);
    await testPath(200, '/api/rand', /random number/);
    await testPath(200, '/api/rand.js', /random number/);
    await testPath(404, '/api/api');
  })
);

test(
  '[vercel dev] should allow user rewrites for path segment files',
  testFixtureStdio('test-zero-config-rewrite', async testPath => {
    await testPath(404, '/');
    await testPath(200, '/echo/1', '{"id":"1"}', {
      'Access-Control-Allow-Origin': '*',
    });
    await testPath(200, '/echo/2', '{"id":"2"}', {
      'Access-Control-Allow-Headers': '*',
    });
  })
);

test('[vercel dev] validate builds', async t => {
  const directory = fixture('invalid-builds');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `builds` property: \[0\]\.src should be string/m
  );
});

test('[vercel dev] validate routes', async t => {
  const directory = fixture('invalid-routes');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `routes` property: \[0\]\.src should be string/m
  );
});

test('[vercel dev] validate cleanUrls', async t => {
  const directory = fixture('invalid-clean-urls');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(output.stderr, /Invalid `cleanUrls` property:\s+should be boolean/m);
});

test('[vercel dev] validate trailingSlash', async t => {
  const directory = fixture('invalid-trailing-slash');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `trailingSlash` property:\s+should be boolean/m
  );
});

test('[vercel dev] validate rewrites', async t => {
  const directory = fixture('invalid-rewrites');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `rewrites` property: \[0\]\.destination should be string/m
  );
});

test('[vercel dev] validate redirects', async t => {
  const directory = fixture('invalid-redirects');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `redirects` property: \[0\]\.statusCode should be integer/m
  );
});

test('[vercel dev] validate headers', async t => {
  const directory = fixture('invalid-headers');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `headers` property: \[0\]\.headers\[0\]\.value should be string/m
  );
});

test('[vercel dev] validate mixed routes and rewrites', async t => {
  const directory = fixture('invalid-mixed-routes-rewrites');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /If `rewrites`, `redirects`, `headers`, `cleanUrls` or `trailingSlash` is used, `routes` cannot be present./m
  );
  t.regex(output.stderr, /vercel\.link\/mix-routing-props/m);
});

// Test seems unstable: It won't return sometimes.
test('[vercel dev] validate env var names', async t => {
  const directory = fixture('invalid-env-var-name');
  const { dev } = await testFixture(directory, { stdio: 'pipe' });

  try {
    let stderr = '';
    dev.stderr.setEncoding('utf8');

    await new Promise((resolve, reject) => {
      dev.stderr.on('data', b => {
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

    t.pass();
  } finally {
    await dev.kill('SIGTERM');
  }

  t.pass();
});

test(
  '[vercel dev] test rewrites with segments serve correct content',
  testFixtureStdio('test-rewrites-with-segments', async testPath => {
    await testPath(200, '/api/users/first', 'first');
    await testPath(200, '/api/fourty-two', '42');
    await testPath(200, '/rand', '42');
    await testPath(200, '/api/dynamic', 'dynamic');
    await testPath(404, '/api');
  })
);

test(
  '[vercel dev] test rewrites serve correct content',
  testFixtureStdio('test-rewrites', async testPath => {
    await testPath(200, '/hello', 'Hello World');
  })
);

test(
  '[vercel dev] test rewrites and redirects is case sensitive',
  testFixtureStdio('test-routing-case-sensitive', async testPath => {
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
  testFixtureStdio('test-clean-urls', async testPath => {
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
  '[vercel dev] test cleanUrls and trailingSlash serve correct content',
  testFixtureStdio('test-clean-urls-trailing-slash', async testPath => {
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
  testFixtureStdio('test-cors-routes', async testPath => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, Accept, Content-Length, Origin, User-Agent',
      'Access-Control-Allow-Methods':
        'GET, POST, OPTIONS, HEAD, PATCH, PUT, DELETE',
    };
    await testPath(200, '/', 'status api', headers, 'GET');
    await testPath(200, '/', 'status api', headers, 'POST');
    await testPath(200, '/api/status.js', 'status api', headers, 'GET');
    await testPath(200, '/api/status.js', 'status api', headers, 'POST');
    await testPath(204, '/', '', headers, 'OPTIONS');
    await testPath(204, '/api/status.js', '', headers, 'OPTIONS');
  })
);

test(
  '[vercel dev] test trailingSlash true serve correct content',
  testFixtureStdio('test-trailing-slash', async testPath => {
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
  '[vercel dev] test trailingSlash false serve correct content',
  testFixtureStdio('test-trailing-slash-false', async testPath => {
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
    async testPath => {
      await testPath(500, '/', /Invalid regular expression/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] support legacy `@now` scope runtimes',
  testFixtureStdio('legacy-now-runtime', async testPath => {
    await testPath(200, '/', /A simple deployment with the Vercel API!/m);
  })
);

test(
  '[vercel dev] 00-list-directory',
  testFixtureStdio('00-list-directory', async testPath => {
    await testPath(200, '/', /Files within/m);
    await testPath(200, '/', /test[0-3]\.txt/m);
  })
);

test(
  '[vercel dev] 01-node',
  testFixtureStdio('01-node', async testPath => {
    await testPath(200, '/', /A simple deployment with the Vercel API!/m);
  })
);

// Angular has `engines: { node: "10.x" }` in its `package.json`
test('[vercel dev] 02-angular-node', async t => {
  if (shouldSkip(t, '02-angular-node', '10.x')) return;

  const directory = fixture('02-angular-node');
  const { dev, port } = await testFixture(directory, { stdio: 'pipe' }, [
    '--debug',
  ]);

  let stderr = '';

  try {
    dev.stderr.on('data', async data => {
      stderr += data.toString();
    });

    // start `vercel dev` detached in child_process
    dev.unref();

    const response = await fetchWithRetry(`http://localhost:${port}`, 180);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Angular \+ Node.js API/m);
  } finally {
    dev.kill('SIGTERM');
  }

  await sleep(5000);

  if (isCanary()) {
    stderr.includes('@now/build-utils@canary');
  } else {
    stderr.includes('@now/build-utils@latest');
  }
});

test(
  '[vercel dev] 03-aurelia',
  testFixtureStdio(
    '03-aurelia',
    async testPath => {
      await testPath(200, '/', /Aurelia Navigation Skeleton/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 04-create-react-app',
  testFixtureStdio('04-create-react-app', async testPath => {
    await testPath(200, '/', /React App/m);
  })
);
/*
test(
  '[vercel dev] 05-gatsby',
  testFixtureStdio('05-gatsby', async testPath => {
    await testPath(200, '/', /Gatsby Default Starter/m);
  })
);
*/
test(
  '[vercel dev] 06-gridsome',
  testFixtureStdio('06-gridsome', async testPath => {
    await testPath(200, '/');
  })
);

test(
  '[vercel dev] 07-hexo-node',
  testFixtureStdio('07-hexo-node', async testPath => {
    await testPath(200, '/', /Hexo \+ Node.js API/m);
  })
);

test('[vercel dev] 08-hugo', async t => {
  if (process.platform === 'darwin') {
    // Update PATH to find the Hugo executable installed via GH Actions
    process.env.PATH = `${resolve(fixture('08-hugo'))}${delimiter}${
      process.env.PATH
    }`;
    const tester = testFixtureStdio('08-hugo', async testPath => {
      await testPath(200, '/', /Hugo/m);
    });
    await tester(t);
  } else {
    console.log(`Skipping 08-hugo on platform ${process.platform}`);
    t.pass();
  }
});

test(
  '[vercel dev] 10-nextjs-node',
  testFixtureStdio('10-nextjs-node', async testPath => {
    await testPath(200, '/', /Next.js \+ Node.js API/m);
  })
);

test(
  '[vercel dev] 12-polymer-node',
  testFixtureStdio(
    '12-polymer-node',
    async testPath => {
      await testPath(200, '/', /Polymer \+ Node.js API/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 13-preact-node',
  testFixtureStdio(
    '13-preact-node',
    async testPath => {
      await testPath(200, '/', /Preact/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 14-svelte-node',
  testFixtureStdio(
    '14-svelte-node',
    async testPath => {
      await testPath(200, '/', /Svelte/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 16-vue-node',
  testFixtureStdio(
    '16-vue-node',
    async testPath => {
      await testPath(200, '/', /Vue.js \+ Node.js API/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 17-vuepress-node',
  testFixtureStdio(
    '17-vuepress-node',
    async testPath => {
      await testPath(200, '/', /VuePress \+ Node.js API/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] double slashes redirect',
  testFixtureStdio(
    '01-node',
    async (_testPath, t, port) => {
      {
        const res = await fetch(`http://localhost:${port}////?foo=bar`, {
          redirect: 'manual',
        });

        validateResponseHeaders(t, res);

        const body = await res.text();
        t.is(res.status, 301);
        t.is(res.headers.get('location'), `http://localhost:${port}/?foo=bar`);
        t.is(body, 'Redirecting to /?foo=bar (301)\n');
      }

      {
        const res = await fetch(`http://localhost:${port}///api////date.js`, {
          method: 'POST',
          redirect: 'manual',
        });

        validateResponseHeaders(t, res);

        const body = await res.text();
        t.is(res.status, 200);
        t.truthy(
          body.startsWith('January') ||
            body.startsWith('February') ||
            body.startsWith('March') ||
            body.startsWith('April') ||
            body.startsWith('May') ||
            body.startsWith('June') ||
            body.startsWith('July') ||
            body.startsWith('August') ||
            body.startsWith('September') ||
            body.startsWith('October') ||
            body.startsWith('November') ||
            body.startsWith('December')
        );
      }
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 18-marko',
  testFixtureStdio(
    '18-marko',
    async testPath => {
      await testPath(200, '/', /Marko Starter/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 19-mithril',
  testFixtureStdio(
    '19-mithril',
    async testPath => {
      await testPath(200, '/', /Mithril on Vercel/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 20-riot',
  testFixtureStdio(
    '20-riot',
    async testPath => {
      await testPath(200, '/', /Riot on Vercel/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 21-charge',
  testFixtureStdio(
    '21-charge',
    async testPath => {
      await testPath(200, '/', /Welcome to my new Charge site/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 22-brunch',
  testFixtureStdio(
    '22-brunch',
    async testPath => {
      await testPath(200, '/', /Bon Appétit./m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 23-docusaurus',
  testFixtureStdio(
    '23-docusaurus',
    async testPath => {
      await testPath(200, '/', /My Site/m);
    },
    { skipDeploy: true }
  )
);

test('[vercel dev] 24-ember', async t => {
  if (shouldSkip(t, '24-ember', '>^6.14.0 || ^8.10.0 || >=9.10.0')) return;

  const tester = await testFixtureStdio(
    '24-ember',
    async testPath => {
      await testPath(200, '/', /HelloWorld/m);
    },
    { skipDeploy: true }
  );

  await tester(t);
});

test(
  '[vercel dev] temporary directory listing',
  testFixtureStdio(
    'temporary-directory-listing',
    async (_testPath, t, port) => {
      const directory = fixture('temporary-directory-listing');
      await fs.unlink(join(directory, 'index.txt')).catch(() => null);

      await sleep(ms('20s'));

      const firstResponse = await fetch(`http://localhost:${port}`);
      validateResponseHeaders(t, firstResponse);
      const body = await firstResponse.text();
      t.is(firstResponse.status, 404, `Received instead: ${body}`);

      await fs.writeFile(join(directory, 'index.txt'), 'hello');

      for (let i = 0; i < 20; i++) {
        const response = await fetch(`http://localhost:${port}`);
        validateResponseHeaders(t, response);

        if (response.status === 200) {
          const body = await response.text();
          t.is(body, 'hello');
        }

        await sleep(ms('1s'));
      }
    },
    { skipDeploy: true }
  )
);

test('[vercel dev] add a `package.json` to trigger `@vercel/static-build`', async t => {
  const directory = fixture('trigger-static-build');

  await fs.unlink(join(directory, 'package.json')).catch(() => null);

  await fs.unlink(join(directory, 'public', 'index.txt')).catch(() => null);

  await fs.rmdir(join(directory, 'public')).catch(() => null);

  const tester = testFixtureStdio(
    'trigger-static-build',
    async (_testPath, t, port) => {
      {
        const response = await fetch(`http://localhost:${port}`);
        validateResponseHeaders(t, response);
        const body = await response.text();
        t.is(body.trim(), 'hello:index.txt');
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
        validateResponseHeaders(t, response);
        const body = await response.text();
        t.is(body.trim(), rnd);
      }
    },
    { skipDeploy: true }
  );

  await tester(t);
});

test('[vercel dev] no build matches warning', async t => {
  const directory = fixture('no-build-matches');
  const { dev } = await testFixture(directory, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    // start `vercel dev` detached in child_process
    dev.unref();

    dev.stderr.setEncoding('utf8');
    await new Promise(resolve => {
      dev.stderr.on('data', str => {
        if (str.includes('did not match any source files')) {
          resolve();
        }
      });
    });

    t.pass();
  } finally {
    await dev.kill('SIGTERM');
  }
});

test(
  '[vercel dev] do not recursivly check the path',
  testFixtureStdio('handle-filesystem-missing', async testPath => {
    await testPath(200, '/', /hello/m);
    await testPath(404, '/favicon.txt');
  })
);

test('[vercel dev] render warning for empty cwd dir', async t => {
  const directory = fixture('empty');
  const { dev, port } = await testFixture(directory, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    dev.unref();

    // Monitor `stderr` for the warning
    dev.stderr.setEncoding('utf8');
    await new Promise(resolve => {
      dev.stderr.on('data', str => {
        if (
          str.includes(
            'There are no files (or only files starting with a dot) inside your deployment'
          )
        ) {
          resolve();
        }
      });
    });

    // Issue a request to ensure a 404 response
    await sleep(ms('3s'));
    const response = await fetch(`http://localhost:${port}`);
    validateResponseHeaders(t, response);
    t.is(response.status, 404);
  } finally {
    await dev.kill('SIGTERM');
  }
});

test('[vercel dev] do not rebuild for changes in the output directory', async t => {
  const directory = fixture('output-is-source');

  // Pack the builder and set it in the `vercel.json`
  const builder = await getPackedBuilderPath('now-static-build');

  await fs.writeFile(
    join(directory, 'vercel.json'),
    JSON.stringify({
      builds: [
        {
          src: 'package.json',
          use: `file://${builder}`,
          config: { zeroConfig: true },
        },
      ],
    })
  );

  const { dev, port } = await testFixture(directory, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    dev.unref();

    let stderr = [];
    const start = Date.now();

    dev.stderr.on('data', str => stderr.push(str));

    while (stderr.join('').includes('Ready') === false) {
      await sleep(ms('3s'));

      if (Date.now() - start > ms('30s')) {
        console.log('stderr:', stderr.join(''));
        break;
      }
    }

    const resp1 = await fetch(`http://localhost:${port}`);
    const text1 = await resp1.text();
    t.is(text1.trim(), 'hello first', stderr.join(''));

    await fs.writeFile(join(directory, 'public', 'index.html'), 'hello second');

    await sleep(ms('3s'));

    const resp2 = await fetch(`http://localhost:${port}`);
    const text2 = await resp2.text();
    t.is(text2.trim(), 'hello second', stderr.join(''));
  } finally {
    await dev.kill('SIGTERM');
  }
});

test(
  '[vercel dev] 25-nextjs-src-dir',
  testFixtureStdio('25-nextjs-src-dir', async testPath => {
    await testPath(200, '/', /Next.js \+ Node.js API/m);
  })
);

test(
  '[vercel dev] 26-nextjs-secrets',
  testFixtureStdio(
    '26-nextjs-secrets',
    async testPath => {
      await testPath(200, '/api/user', /runtime/m);
      await testPath(200, '/', /buildtime/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 27-zero-config-env',
  testFixtureStdio(
    '27-zero-config-env',
    async testPath => {
      await testPath(200, '/api/print', /build-and-runtime/m);
      await testPath(200, '/', /build-and-runtime/m);
    },
    { skipDeploy: true }
  )
);

test(
  '[vercel dev] 28-vercel-json-and-ignore',
  testFixtureStdio('28-vercel-json-and-ignore', async testPath => {
    await testPath(200, '/api/one', 'One');
    await testPath(404, '/api/two');
    await testPath(200, '/api/three', 'One');
  })
);

test(
  '[vercel dev] Use `@vercel/python` with Flask requirements.txt',
  testFixtureStdio('python-flask', async testPath => {
    const name = 'Alice';
    const year = new Date().getFullYear();
    await testPath(200, `/api/user?name=${name}`, new RegExp(`Hello ${name}`));
    await testPath(200, `/api/date`, new RegExp(`Current date is ${year}`));
    await testPath(200, `/api/date.py`, new RegExp(`Current date is ${year}`));
  })
);

test(
  '[vercel dev] Use custom runtime from the "functions" property',
  testFixtureStdio('custom-runtime', async testPath => {
    await testPath(200, `/api/user`, /Hello, from Bash!/m);
    await testPath(200, `/api/user.sh`, /Hello, from Bash!/m);
  })
);
