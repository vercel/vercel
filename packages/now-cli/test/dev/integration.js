import ms from 'ms';
import fs from 'fs-extra';
import test from 'ava';
import path from 'path';
import _execa from 'execa';
import fetch from 'node-fetch';
import sleep from 'then-sleep';
import retry from 'async-retry';
import { satisfies } from 'semver';
import { getDistTag } from '../../src/util/get-dist-tag';
import { version as cliVersion } from '../../package.json';

const isCanary = () => getDistTag(cliVersion) === 'canary';

let port = 3000;

const binaryPath = path.resolve(__dirname, `../../scripts/start.js`);
const fixture = name => path.join('test', 'dev', 'fixtures', name);

// For the Hugo executable
process.env.PATH = `${path.resolve(fixture('08-hugo'))}${path.delimiter}${
  process.env.PATH
}`;

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
  t.is(res.headers.get('x-now-trace'), 'dev1');
  t.truthy(res.headers.get('cache-control').length > 0);
  t.truthy(
    /^dev1:[0-9a-z]{5}-[1-9][0-9]+-[a-f0-9]{12}$/.test(
      res.headers.get('x-now-id')
    )
  );
}

async function exec(directory, args = []) {
  return execa(binaryPath, ['dev', directory, ...args], {
    reject: false,
    shell: true,
    env: { __NOW_SKIP_DEV_COMMAND: 1 },
  });
}

async function runNpmInstall(fixturePath) {
  if (await fs.exists(path.join(fixturePath, 'package.json'))) {
    return execa('yarn', ['install'], { cwd: fixturePath, shell: true });
  }
}

async function getPackedBuilderPath(builderDirName) {
  const packagePath = path.join(__dirname, '..', '..', '..', builderDirName);
  const output = await execa('npm', ['pack'], {
    cwd: packagePath,
    shell: true,
  });

  if (output.exitCode !== 0 || output.stdout.trim() === '') {
    throw new Error(
      `Failed to pack ${builderDirName}: ${formatOutput(output)}`
    );
  }

  return path.join(packagePath, output.stdout.trim());
}

async function testPath(t, port, status, path, expectedText, headers = {}) {
  const opts = { redirect: 'manual' };
  const res = await fetch(`http://localhost:${port}${path}`, opts);
  const msg = `Testing path ${path}`;
  t.is(res.status, status, msg);
  if (expectedText) {
    const actualText = await res.text();
    t.is(actualText.trim(), expectedText.trim(), msg);
  }
  if (headers) {
    Object.keys(headers).forEach(key => {
      const k = key.toLowerCase();
      t.is(headers[k], res.headers[k], msg);
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
      env: { ...opts.env, __NOW_SKIP_DEV_COMMAND: 1 },
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

function testFixtureStdio(directory, fn) {
  return async t => {
    let dev;
    const dir = fixture(directory);

    await runNpmInstall(dir);

    const stdoutList = [];
    const stderrList = [];

    const readyResolver = createResolver();
    const exitResolver = createResolver();

    try {
      let stderr = '';
      let printedOutput = false;

      dev = execa(binaryPath, ['dev', dir, '-l', port], {
        shell: true,
        env: { __NOW_SKIP_DEV_COMMAND: 1 },
      });

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
      const helperTestPath = (...args) => testPath(t, port, ...args);
      await fn(t, port, helperTestPath);
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
  '[now dev] validate routes that use `check: true`',
  testFixtureStdio('routes-check-true', async (t, port) => {
    const response = await fetchWithRetry(`http://localhost:${port}/blog/post`);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Blog Home/gm);
  })
);

test(
  '[now dev] validate routes that use `check: true` and `status` code',
  testFixtureStdio('routes-check-true-status', async (t, port) => {
    const secret = await fetch(`http://localhost:${port}/secret`);
    t.is(secret.status, 403);
    t.regex(await secret.text(), /FORBIDDEN/gm);

    const rewrite = await fetchWithRetry(`http://localhost:${port}/post`);
    t.is(rewrite.status, 200);
    t.regex(await rewrite.text(), /This is a post/gm);

    const raw = await fetchWithRetry(`http://localhost:${port}/post.html`);
    t.is(raw.status, 200);
    t.regex(await raw.text(), /This is a post/gm);
  })
);

test(
  '[now dev] handles miss after route',
  testFixtureStdio('handle-miss-after-route', async (t, port) => {
    const response = await fetchWithRetry(`http://localhost:${port}/post`);

    const test = response.headers.get('test');
    const override = response.headers.get('override');
    t.is(test, '1', 'exected miss header to be added');
    t.is(override, 'one', 'exected override header to not override');

    const body = await response.text();
    t.regex(body, /Blog/gm);
  })
);

test(
  '[now dev] handles miss after rewrite',
  testFixtureStdio('handle-miss-after-rewrite', async (t, port) => {
    const response = await fetchWithRetry(`http://localhost:${port}/post`);
    const test = response.headers.get('test');
    const override = response.headers.get('override');
    t.is(test, '1', 'expected miss header to be added');
    t.is(override, 'two', 'expected override header to not override');
    t.is(response.status, 200);
    const body = await response.text();
    t.regex(body, /Blog Post Page/gm);

    const response1 = await fetchWithRetry(
      `http://localhost:${port}/blog/post`
    );
    const test1 = response.headers.get('test');
    const override1 = response.headers.get('override');
    t.is(test1, '1', 'expected miss header to be added');
    t.is(override1, 'two', 'expected override header to be added');
    t.is(response1.status, 200);
    t.regex(await response1.text(), /Blog Post Page/gm);

    const response2 = await fetchWithRetry(
      `http://localhost:${port}/about.html`
    );
    const test2 = response2.headers.get('test');
    const override2 = response2.headers.get('override');
    t.is(test2, null, 'expected miss header to be not be added');
    t.is(override2, null, 'expected override header to not be added');
    t.is(response2.status, 200);
    t.regex(await response2.text(), /About Page/gm);
  })
);

test(
  '[now dev] displays directory listing after miss',
  testFixtureStdio('handle-miss-display-dir-list', async (t, port) => {
    const response = await fetchWithRetry(`http://localhost:${port}/post`);
    const body = await response.text();
    t.regex(body, /one.html/gm);
  })
);

test(
  '[now dev] does not display directory listing after 404',
  testFixtureStdio('handle-miss-hide-dir-list', async (t, port) => {
    const post = await fetch(`http://localhost:${port}/post`);
    t.is(post.status, 404);

    const file = await fetch(`http://localhost:${port}/post/one.html`);
    t.is(file.status, 200);
    t.regex(await file.text(), /First Post/gm);
  })
);

test(
  '[now dev] handles hit after handle: filesystem',
  testFixtureStdio('handle-hit-after-fs', async (t, port) => {
    const response = await fetchWithRetry(`http://localhost:${port}/blog.html`);
    const test = response.headers.get('test');
    t.is(test, '1', 'expected hit header to be added');
    const body = await response.text();
    t.regex(body, /Blog Page/gm);
  })
);

test(
  '[now dev] handles hit after dest',
  testFixtureStdio('handle-hit-after-dest', async (t, port) => {
    const response = await fetchWithRetry(`http://localhost:${port}/post`);
    const test = response.headers.get('test');
    const override = response.headers.get('override');
    t.is(test, '1', 'expected hit header to be added');
    t.is(override, 'one', 'expected hit header to not override');
    const body = await response.text();
    t.regex(body, /Blog Post/gm);
  })
);

test(
  '[now dev] handles hit after rewrite',
  testFixtureStdio('handle-hit-after-rewrite', async (t, port) => {
    const response = await fetchWithRetry(`http://localhost:${port}/post`);
    const test = response.headers.get('test');
    const override = response.headers.get('override');
    t.is(test, '1', 'expected hit header to be added');
    t.is(override, 'one', 'expected hit header to not override');
    const body = await response.text();
    t.regex(body, /Blog Post/gm);
  })
);

test(
  '[now dev] should serve the public directory and api functions',
  testFixtureStdio('public-and-api', async (t, port) => {
    const index = await fetchWithRetry(`http://localhost:${port}`);
    t.regex(await index.text(), /home page/gm);
    const about = await fetchWithRetry(`http://localhost:${port}/about.html`);
    t.regex(await about.text(), /about page/gm);
    const date = await fetchWithRetry(`http://localhost:${port}/api/date`);
    t.regex(await date.text(), /current date/gm);
    const rand = await fetchWithRetry(`http://localhost:${port}/api/rand`);
    t.regex(await rand.text(), /random number/gm);
    const rand2 = await fetchWithRetry(`http://localhost:${port}/api/rand.js`);
    t.regex(await rand2.text(), /random number/gm);
    const notfound = await fetch(`http://localhost:${port}/api`);
    t.is(notfound.status, 404);
  })
);

test('[now dev] validate builds', async t => {
  const directory = fixture('invalid-builds');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `builds` property: \[0\]\.src should be string/gm
  );
});

test('[now dev] validate routes', async t => {
  const directory = fixture('invalid-routes');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `routes` property: \[0\]\.src should be string/gm
  );
});

test('[now dev] validate cleanUrls', async t => {
  const directory = fixture('invalid-clean-urls');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(output.stderr, /Invalid `cleanUrls` property:\s+should be boolean/gm);
});

test('[now dev] validate trailingSlash', async t => {
  const directory = fixture('invalid-trailing-slash');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `trailingSlash` property:\s+should be boolean/gm
  );
});

test('[now dev] validate rewrites', async t => {
  const directory = fixture('invalid-rewrites');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `rewrites` property: \[0\]\.destination should be string/gm
  );
});

test('[now dev] validate redirects', async t => {
  const directory = fixture('invalid-redirects');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `redirects` property: \[0\]\.statusCode should be integer/gm
  );
});

test('[now dev] validate headers', async t => {
  const directory = fixture('invalid-headers');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `headers` property: \[0\]\.headers\[0\]\.value should be string/gm
  );
});

test('[now dev] validate mixed routes and rewrites', async t => {
  const directory = fixture('invalid-mixed-routes-rewrites');
  const output = await exec(directory);

  t.is(output.exitCode, 1, formatOutput(output));
  t.regex(output.stderr, /Cannot define both `routes` and `rewrites`/gm);
});

// Test seems unstable: It won't return sometimes.
test('[now dev] validate env var names', async t => {
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
  '[now dev] test rewrites with segments serve correct content',
  testFixtureStdio('test-rewrites-with-segments', async (t, port) => {
    const users = await fetchWithRetry(
      `http://localhost:${port}/api/users/first`,
      3
    );
    t.regex(await users.text(), /first/gm);
    const fourtytwo = await fetchWithRetry(
      `http://localhost:${port}/api/fourty-two`,
      3
    );
    t.regex(await fourtytwo.text(), /42/gm);
    const rand = await fetchWithRetry(`http://localhost:${port}/rand`, 3);
    t.regex(await rand.text(), /42/gm);
    const dynamic = await fetchWithRetry(
      `http://localhost:${port}/api/dynamic`,
      3
    );
    t.regex(await dynamic.text(), /dynamic/gm);
    const notfound = await fetch(`http://localhost:${port}/api`);
    t.is(notfound.status, 404);
  })
);

test(
  '[now dev] test rewrites serve correct content',
  testFixtureStdio('test-rewrites', async (t, port) => {
    const response = await fetchWithRetry(`http://localhost:${port}/hello`, 3);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Hello World/gm);
  })
);

test(
  '[now dev] test cleanUrls serve correct content',
  testFixtureStdio('test-clean-urls', async (t, port, testPath) => {
    await testPath(200, '/', 'Index Page');
    await testPath(200, '/about', 'About Page');
    await testPath(200, '/sub', 'Sub Index Page');
    await testPath(200, '/sub/another', 'Sub Another Page');
    await testPath(200, '/style.css', 'body { color: green }');
    await testPath(308, '/index.html', '', { Location: '/' });
    await testPath(308, '/about.html', '', { Location: '/about' });
    await testPath(308, '/sub/index.html', '', { Location: '/sub' });
    await testPath(308, '/sub/another.html', '', { Location: '/sub/another' });
  })
);

test(
  '[now dev] test cleanUrls and trailingSlash serve correct content',
  testFixtureStdio(
    'test-clean-urls-trailing-slash',
    async (t, port, testPath) => {
      await testPath(200, '/', 'Index Page');
      await testPath(200, '/about/', 'About Page');
      await testPath(200, '/sub/', 'Sub Index Page');
      await testPath(200, '/sub/another/', 'Sub Another Page');
      await testPath(200, '/style.css', 'body { color: green }');
      await testPath(308, '/index.html', '', { Location: '/' });
      await testPath(308, '/about.html', '', { Location: '/about/' });
      await testPath(308, '/sub/index.html', '', { Location: '/sub/' });
      await testPath(308, '/sub/another.html', '', {
        Location: '/sub/another/',
      });
    }
  )
);

test(
  '[now dev] test trailingSlash true serve correct content',
  testFixtureStdio('test-trailing-slash', async (t, port, testPath) => {
    await testPath(200, '/', 'Index Page');
    await testPath(200, '/index.html', 'Index Page');
    await testPath(200, '/about.html', 'About Page');
    await testPath(200, '/sub/', 'Sub Index Page');
    await testPath(200, '/sub/index.html', 'Sub Index Page');
    await testPath(200, '/sub/another.html', 'Sub Another Page');
    await testPath(200, '/style.css', 'body { color: green }');
    await testPath(308, '/about.html/', '', { Location: '/about.html' });
    await testPath(308, '/style.css/', '', { Location: '/style.css' });
    await testPath(308, '/sub', '', { Location: '/sub/' });
  })
);

test(
  '[now dev] test trailingSlash false serve correct content',
  testFixtureStdio('test-trailing-slash-false', async (t, port, testPath) => {
    await testPath(200, '/', 'Index Page');
    await testPath(200, '/index.html', 'Index Page');
    await testPath(200, '/about.html', 'About Page');
    await testPath(200, '/sub', 'Sub Index Page');
    await testPath(200, '/sub/index.html', 'Sub Index Page');
    await testPath(200, '/sub/another.html', 'Sub Another Page');
    await testPath(200, '/style.css', 'body { color: green }');
    await testPath(308, '/about.html/', '', { Location: '/about.html' });
    await testPath(308, '/sub/', '', { Location: '/sub' });
    await testPath(308, '/sub/another.html/', '', {
      Location: '/sub/another.html',
    });
  })
);

test(
  '[now dev] throw when invalid builder routes detected',
  testFixtureStdio('invalid-builder-routes', async (t, port) => {
    const response = await fetch(`http://localhost:${port}`);
    const body = await response.text();
    t.regex(body, /Invalid regular expression/gm);
  })
);

test(
  '[now dev] 00-list-directory',
  testFixtureStdio('00-list-directory', async (t, port) => {
    const response = await fetchWithRetry(`http://localhost:${port}`, 60);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Files within/gm);
    t.regex(body, /test1.txt/gm);
    t.regex(body, /directory/gm);
  })
);

test('[now dev] 01-node', async t => {
  const tester = testFixtureStdio('01-node', async (t, port) => {
    const response = await fetch(`http://localhost:${port}`);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /A simple deployment with the Now API!/gm);
  });

  await tester(t);
});

// Angular has `engines: { node: "10.x" }` in its `package.json`
test('[now dev] 02-angular-node', async t => {
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

    // start `now dev` detached in child_process
    dev.unref();

    const response = await fetchWithRetry(`http://localhost:${port}`, 180);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Angular \+ Node.js API/gm);
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

test('[now dev] 03-aurelia', async t => {
  const tester = testFixtureStdio('03-aurelia', async (t, port) => {
    const response = await fetch(`http://localhost:${port}`);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Aurelia Navigation Skeleton/gm);
  });

  await tester(t);
});

test(
  '[now dev] 04-create-react-app',
  testFixtureStdio('04-create-react-app', async (t, port) => {
    const response = await fetch(`http://localhost:${port}`);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /React App/gm);
  })
);

test('[now dev] 05-gatsby', async t => {
  if (shouldSkip(t, '05-gatsby', '>^6.14.0 || ^8.10.0 || >=9.10.0')) return;

  const tester = testFixtureStdio('05-gatsby', async (t, port) => {
    const response = await fetch(`http://localhost:${port}`);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Gatsby Default Starter/gm);
  });

  await tester(t);
});

test('[now dev] 06-gridsome', async t => {
  const tester = testFixtureStdio('06-gridsome', async (t, port) => {
    const response = await fetch(`http://localhost:${port}`);

    validateResponseHeaders(t, response);
    t.is(response.status, 200, await response.text());
  });

  await tester(t);
});

test(
  '[now dev] 07-hexo-node',
  testFixtureStdio('07-hexo-node', async (t, port) => {
    const response = await fetchWithRetry(`http://localhost:${port}`, 180);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Hexo \+ Node.js API/gm);
  })
);

test(
  '[now dev] 08-hugo',
  testFixtureStdio('08-hugo', async (t, port) => {
    const response = await fetch(`http://localhost:${port}`);

    validateResponseHeaders(t, response);

    // const body = await response.text();
    // t.regex(body, /Hugo on ZEIT Now/gm);
    t.is(response.status, 200, await response.text());
  })
);

test('[now dev] 10-nextjs-node', async t => {
  const tester = testFixtureStdio('10-nextjs-node', async (t, port) => {
    const response = await fetch(`http://localhost:${port}`);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Next.js \+ Node.js API/gm);
  });

  await tester(t);
});

// test('[now dev] 11-nuxtjs-node', async t => {
//   const directory = fixture('11-nuxtjs-node');
//   const { dev, port } = await testFixture(directory);

//   try {
//     // start `now dev` detached in child_process
//     dev.unref();

//     const response = await fetchWithRetry(`http://localhost:${port}`, 180);

//     validateResponseHeaders(t, response);

//     const body = await response.text();
//     t.regex(body, /Nuxt.js \+ Node.js API/gm);

//   } finally {
//     dev.kill('SIGTERM')
//   }
// });

test('[now dev] 12-polymer-node', async t => {
  const directory = fixture('12-polymer-node');
  const { dev, port } = await testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const response = await fetchWithRetry(`http://localhost:${port}`, 180);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Polymer \+ Node.js API/gm);
  } finally {
    await dev.kill('SIGTERM');
  }
});

test('[now dev] 13-preact-node', async t => {
  const directory = fixture('13-preact-node');
  const { dev, port } = await testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const response = await fetchWithRetry(`http://localhost:${port}`, 180);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Preact \+ Node.js API/gm);
  } finally {
    await dev.kill('SIGTERM');
  }
});

test('[now dev] 14-svelte-node', async t => {
  const directory = fixture('14-svelte-node');
  const { dev, port } = await testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const response = await fetchWithRetry(`http://localhost:${port}`, 80);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Svelte \+ Node.js API/gm);
  } finally {
    await dev.kill('SIGTERM');
  }
});

// test('[now dev] 15-umijs-node', async t => {
//   const directory = fixture('15-umijs-node');
//   const { dev, port } = await testFixture(directory);

//   try {
//     // start `now dev` detached in child_process
//     dev.unref();

//     const response = await fetchWithRetry(`http://localhost:${port}`, 80);

//     validateResponseHeaders(t, response);

//     const body = await response.text();
//     t.regex(body, /UmiJS \+ Node.js API/gm);

//   } finally {
//     dev.kill('SIGTERM')
//   }
// });

test('[now dev] 16-vue-node', async t => {
  const directory = fixture('16-vue-node');
  const { dev, port } = await testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const response = await fetchWithRetry(`http://localhost:${port}`, 180);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Vue.js \+ Node.js API/gm);
  } finally {
    await dev.kill('SIGTERM');
  }
});

test('[now dev] 17-vuepress-node', async t => {
  const directory = fixture('17-vuepress-node');
  const { dev, port } = await testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const response = await fetchWithRetry(`http://localhost:${port}`, 180);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /VuePress \+ Node.js API/gm);
  } finally {
    await dev.kill('SIGTERM');
  }
});

test('[now dev] double slashes redirect', async t => {
  const directory = fixture('01-node');
  const { dev, port } = await testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    // Wait for `now dev` to boot up
    await sleep(ms('10s'));

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
  } finally {
    await dev.kill('SIGTERM');
  }
});

test('[now dev] 18-marko', async t => {
  const tester = testFixtureStdio('18-marko', async (t, port) => {
    const response = await fetch(`http://localhost:${port}`);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Marko Starter/gm);
  });

  await tester(t);
});

test(
  '[now dev] 19-mithril',
  testFixtureStdio('19-mithril', async (t, port) => {
    const response = await fetch(`http://localhost:${port}`);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Mithril on ZEIT Now/gm);
  })
);

test(
  '[now dev] 20-riot',
  testFixtureStdio('20-riot', async (t, port) => {
    const response = await fetch(`http://localhost:${port}`);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Riot on ZEIT Now/gm);
  })
);

test('[now dev] 21-charge', async t => {
  const tester = testFixtureStdio('21-charge', async (t, port) => {
    const response = await fetch(`http://localhost:${port}`);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Welcome to my new Charge site/gm);
  });

  await tester(t);
});

test(
  '[now dev] 22-brunch',
  testFixtureStdio('22-brunch', async (t, port) => {
    const response = await fetchWithRetry(`http://localhost:${port}`, 50);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Bon Appétit./gm);
  })
);

test('[now dev] 23-docusaurus', async t => {
  const tester = testFixtureStdio('23-docusaurus', async (t, port) => {
    const response = await fetch(`http://localhost:${port}`);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Test Site · A website for testing/gm);
  });

  await tester(t);
});

test('[now dev] 24-ember', async t => {
  if (shouldSkip(t, '24-ember', '>^6.14.0 || ^8.10.0 || >=9.10.0')) return;

  const tester = await testFixtureStdio('24-ember', async (t, port) => {
    const response = await fetch(`http://localhost:${port}`);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /HelloWorld/gm);
  });

  tester(t);
});

test('[now dev] temporary directory listing', async t => {
  const directory = fixture('temporary-directory-listing');
  const { dev, port } = await testFixture(directory);

  try {
    await fs.unlink(path.join(directory, 'index.txt')).catch(() => null);

    // start `now dev` detached in child_process
    dev.unref();

    await sleep(ms('20s'));

    const firstResponse = await fetch(`http://localhost:${port}`);
    validateResponseHeaders(t, firstResponse);
    const body = await firstResponse.text();
    t.is(firstResponse.status, 404, `Received instead: ${body}`);

    await fs.writeFile(path.join(directory, 'index.txt'), 'hello');

    for (let i = 0; i < 20; i++) {
      const response = await fetch(`http://localhost:${port}`);
      validateResponseHeaders(t, response);

      if (response.status === 200) {
        const body = await response.text();
        t.is(body, 'hello');
      }

      await sleep(ms('1s'));
    }
  } finally {
    await dev.kill('SIGTERM');
  }
});

test('[now dev] add a `package.json` to trigger `@now/static-build`', async t => {
  const directory = fixture('trigger-static-build');

  await fs.unlink(path.join(directory, 'package.json')).catch(() => null);

  await fs
    .unlink(path.join(directory, 'public', 'index.txt'))
    .catch(() => null);

  await fs.rmdir(path.join(directory, 'public')).catch(() => null);

  const tester = testFixtureStdio('trigger-static-build', async (t, port) => {
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

    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify(pkg)
    );

    // Wait until file events have been processed
    await sleep(ms('2s'));

    {
      const response = await fetch(`http://localhost:${port}`);
      validateResponseHeaders(t, response);
      const body = await response.text();
      t.is(body.trim(), rnd);
    }
  });

  await tester(t);
});

test('[now dev] no build matches warning', async t => {
  const directory = fixture('no-build-matches');
  const { dev } = await testFixture(directory, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    // start `now dev` detached in child_process
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

test('[now dev] do not recursivly check the path', async t => {
  const directory = fixture('handle-filesystem-missing');
  const { dev, port } = await testFixture(directory);

  try {
    dev.unref();

    {
      const response = await fetchWithRetry(`http://localhost:${port}`, 180);
      validateResponseHeaders(t, response);
      const body = await response.text();
      t.is(body.trim(), 'hello');
    }

    {
      const response = await fetch(`http://localhost:${port}/favicon.txt`);
      validateResponseHeaders(t, response);
      t.is(response.status, 404);
    }
  } finally {
    dev.kill('SIGTERM');
  }
});

test('[now dev] render warning for empty cwd dir', async t => {
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

test('[now dev] do not rebuild for changes in the output directory', async t => {
  const directory = fixture('output-is-source');

  // Pack the builder and set it in the now.json
  const builder = await getPackedBuilderPath('now-static-build');

  await fs.writeFile(
    path.join(directory, 'now.json'),
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

    await fs.writeFile(
      path.join(directory, 'public', 'index.html'),
      'hello second'
    );

    await sleep(ms('3s'));

    const resp2 = await fetch(`http://localhost:${port}`);
    const text2 = await resp2.text();
    t.is(text2.trim(), 'hello second', stderr.join(''));
  } finally {
    await dev.kill('SIGTERM');
  }
});

test('[now dev] 25-nextjs-src-dir', async t => {
  const directory = fixture('25-nextjs-src-dir');
  const { dev, port } = await testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const response = await fetchWithRetry(`http://localhost:${port}`, 80);

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Next.js \+ Node.js API/gm);
  } finally {
    dev.kill('SIGTERM');
  }
});

test(
  '[now dev] 26-nextjs-secrets',
  testFixtureStdio('26-nextjs-secrets', async (t, port) => {
    const user = await fetchWithRetry(`http://localhost:${port}/api/user`);
    const index = await fetchWithRetry(`http://localhost:${port}`);

    validateResponseHeaders(t, user);
    validateResponseHeaders(t, index);

    t.regex(await user.text(), new RegExp('runtime'));
    t.regex(await index.text(), new RegExp('buildtime'));
  })
);

test(
  '[now dev] Use `@now/python` with Flask requirements.txt',
  testFixtureStdio('python-flask', async (t, port) => {
    const name = 'Alice';
    const year = new Date().getFullYear();
    const user = await fetchWithRetry(
      `http://localhost:${port}/api/user?name=${name}`
    );
    const date = await fetchWithRetry(`http://localhost:${port}/api/date`);
    const ext = await fetchWithRetry(`http://localhost:${port}/api/date.py`);

    validateResponseHeaders(t, user);
    validateResponseHeaders(t, date);
    validateResponseHeaders(t, ext);

    t.regex(await user.text(), new RegExp(`Hello ${name}`));
    t.regex(await date.text(), new RegExp(`Current date is ${year}`));
    t.regex(await ext.text(), new RegExp(`Current date is ${year}`));
  })
);

test(
  '[now dev] Use runtime from the functions property',
  testFixtureStdio('custom-runtime', async (t, port) => {
    const extensionless = await fetchWithRetry(
      `http://localhost:${port}/api/user`
    );
    const extension = await fetchWithRetry(
      `http://localhost:${port}/api/user.sh`
    );

    validateResponseHeaders(t, extensionless);
    validateResponseHeaders(t, extension);

    t.regex(await extensionless.text(), /Hello, from Bash!/gm);
    t.regex(await extension.text(), /Hello, from Bash!/gm);
  })
);
