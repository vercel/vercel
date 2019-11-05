import ms from 'ms';
import fs from 'fs-extra';
import test from 'ava';
import path from 'path';
import execa from 'execa';
import fetch from 'node-fetch';
import sleep from 'then-sleep';
import { satisfies } from 'semver';
import { getDistTag } from '../../src/util/get-dist-tag';
import { version as cliVersion } from '../../package.json';

const isCanary = () => getDistTag(cliVersion) === 'canary';

let port = 3000;
const binaryPath = path.resolve(__dirname, `../../scripts/start.js`);
const fixture = name => path.join('test', 'dev', 'fixtures', name);

function fetchWithRetry(url, retries = 3, opts = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(url, opts);
      if (!res.ok) {
        throw new Error('Responded with status ' + res.status);
      }
      resolve(res);
    } catch (error) {
      if (retries === 0) {
        reject(error);
        return;
      }
      await sleep(1000);
      fetchWithRetry(url, retries - 1, opts)
        .then(resolve)
        .catch(reject);
    }
  });
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
  });
}

async function runNpmInstall(fixturePath) {
  if (await fs.exists(path.join(fixturePath, 'package.json'))) {
    if (process.platform === 'darwin' && satisfies(process.version, '8.x')) {
      await execa('yarn', ['cache', 'clean']);
    }

    return execa('yarn', ['install'], { cwd: fixturePath });
  }
}

function formatOutput({ stderr, stdout }) {
  return `Received:\n"${stderr}"\n"${stdout}"`;
}

async function getPackedBuilderPath(builderDirName) {
  const packagePath = path.join(__dirname, '..', '..', '..', builderDirName);
  const output = await execa('npm', ['pack'], {
    cwd: packagePath,
  });

  if (output.code !== 0 || output.stdout.trim() === '') {
    throw new Error(
      `Failed to pack ${builderDirName}: ${formatOutput(output)}`
    );
  }

  return path.join(packagePath, output.stdout.trim());
}

async function testFixture(directory, opts = {}, args = []) {
  await runNpmInstall(directory);

  port = ++port;
  return {
    dev: execa(binaryPath, ['dev', directory, '-l', String(port), ...args], {
      reject: false,
      detached: true,
      stdio: 'ignore',
      ...opts,
    }),
    port,
  };
}

function testFixtureStdio(directory, fn) {
  return async t => {
    let dev;
    const dir = fixture(directory);

    await runNpmInstall(dir);

    try {
      port = ++port;
      let output = '';
      let readyResolve;
      let readyPromise = new Promise(resolve => {
        readyResolve = resolve;
      });

      dev = execa(binaryPath, ['dev', dir, '-l', port]);
      dev.stderr.on('data', async data => {
        output += data.toString();
        if (data.toString().includes('Ready! Available at')) {
          readyResolve();
        }

        if (
          data.toString().includes('Command failed') ||
          data.toString().includes('Error!')
        ) {
          dev.kill('SIGTERM');
          console.log(output);
          process.exit(1);
        }
      });

      await readyPromise;
      await fn(t, port);
    } finally {
      dev.kill('SIGTERM');
    }
  };
}

test('[now dev] validate builds', async t => {
  const directory = fixture('invalid-builds');
  const output = await exec(directory);

  t.is(output.code, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `builds` property: \[0\]\.src should be string/gm
  );
});

test('[now dev] validate routes', async t => {
  const directory = fixture('invalid-routes');
  const output = await exec(directory);

  t.is(output.code, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `routes` property: \[0\]\.src should be string/gm
  );
});

test('[now dev] validate cleanUrls', async t => {
  const directory = fixture('invalid-clean-urls');
  const output = await exec(directory);

  t.is(output.code, 1, formatOutput(output));
  t.regex(output.stderr, /Invalid `cleanUrls` property:\s+should be boolean/gm);
});

test('[now dev] validate trailingSlash', async t => {
  const directory = fixture('invalid-trailing-slash');
  const output = await exec(directory);

  t.is(output.code, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `trailingSlash` property:\s+should be boolean/gm
  );
});

test('[now dev] validate rewrites', async t => {
  const directory = fixture('invalid-rewrites');
  const output = await exec(directory);

  t.is(output.code, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `rewrites` property: \[0\]\.destination should be string/gm
  );
});

test('[now dev] validate redirects', async t => {
  const directory = fixture('invalid-redirects');
  const output = await exec(directory);

  t.is(output.code, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `redirects` property: \[0\]\.statusCode should be integer/gm
  );
});

test('[now dev] validate headers', async t => {
  const directory = fixture('invalid-headers');
  const output = await exec(directory);

  t.is(output.code, 1, formatOutput(output));
  t.regex(
    output.stderr,
    /Invalid `headers` property: \[0\]\.headers\[0\]\.value should be string/gm
  );
});

test('[now dev] validate mixed routes and rewrites', async t => {
  const directory = fixture('invalid-mixed-routes-rewrites');
  const output = await exec(directory);

  t.is(output.code, 1, formatOutput(output));
  t.regex(output.stderr, /Cannot define both `routes` and `rewrites`/gm);
});

test('[now dev] validate env var names', async t => {
  const directory = fixture('invalid-env-var-name');
  const { dev } = await testFixture(directory, { stdio: 'pipe' });

  try {
    // start `now dev` detached in child_process
    dev.unref();

    let stderr = '';
    dev.stderr.setEncoding('utf8');

    await new Promise(resolve => {
      dev.stderr.on('data', b => {
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
    });

    t.pass();
  } finally {
    dev.kill('SIGTERM');
  }
});

test(
  '[now dev] test rewrites serve correct content',
  testFixtureStdio('test-rewrites', async (t, port) => {
    const result = await fetchWithRetry(`http://localhost:${port}/hello`, 3);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Hello World/gm);
  })
);

test(
  '[now dev] test cleanUrls serve correct content',
  testFixtureStdio('test-clean-urls', async (t, port) => {
    const opts = { redirect: 'manual' };
    const testPath = async (status, path, expectedText, headers = {}) => {
      const res = await fetch(`http://localhost:${port}${path}`, opts);
      t.is(res.status, status);
      if (expectedText) {
        const actualText = await res.text();
        t.is(actualText.trim(), expectedText.trim());
      }
      if (headers) {
        Object.keys(headers).forEach(key => {
          const k = key.toLowerCase();
          t.is(headers[k], res.headers[k]);
        });
      }
    };
    await testPath(200, '/', 'Index Page');
    await testPath(200, '/about', 'About Page');
    await testPath(200, '/sub', 'Sub Index Page');
    await testPath(200, '/sub/another', 'Sub Another Page');
    await testPath(200, '/style.css', 'body { color: green }');
    await testPath(301, '/index.html', '', { Location: '/' });
    await testPath(301, '/about.html', '', { Location: '/about' });
    await testPath(301, '/sub/index.html', '', { Location: '/sub' });
    await testPath(301, '/sub/another.html', '', { Location: '/sub/another' });
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
    const result = await fetchWithRetry(`http://localhost:${port}`, 60);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Files within/gm);
    t.regex(body, /test1.txt/gm);
    t.regex(body, /directory/gm);
  })
);

test('[now dev] 01-node', async t => {
  const directory = fixture('01-node');
  const { dev, port } = await testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const result = await fetchWithRetry(`http://localhost:${port}`, 80);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /A simple deployment with the Now API!/gm);
  } finally {
    dev.kill('SIGTERM');
  }
});

// Angular has `engines: { node: "10.x" }` in its `package.json`
if (satisfies(process.version, '10.x')) {
  test('[now dev] 02-angular-node', async t => {
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

      const result = await fetchWithRetry(`http://localhost:${port}`, 180);
      const response = await result;

      validateResponseHeaders(t, response);

      const body = await response.text();
      t.regex(body, /Angular \+ Node.js API/gm);
    } finally {
      dev.kill('SIGTERM');
    }

    if (isCanary()) {
      stderr.includes('@now/build-utils@canary');
    } else {
      stderr.includes('@now/build-utils@latest');
    }
  });
} else {
  console.log('Skipping `02-angular-node` test since it requires Node >= 10.9');
}

// eslint has `engines: { node: ">^6.14.0 || ^8.10.0 || >=9.10.0" }` in its `package.json`
if (satisfies(process.version, '>^6.14.0 || ^8.10.0 || >=9.10.0')) {
  test(
    '[now dev] 03-aurelia',
    testFixtureStdio('03-aurelia', async (t, port) => {
      const result = fetch(`http://localhost:${port}`);
      const response = await result;

      validateResponseHeaders(t, response);

      const body = await response.text();
      t.regex(body, /Aurelia Navigation Skeleton/gm);
    })
  );
} else {
  console.log(
    'Skipping `03-aurelia` test since it requires Node >= ^6.14.0 || ^8.10.0 || >=9.10.0'
  );
}

// test(
//   '[now dev] 04-create-react-app-node',
//   testFixtureStdio('create-react-app', async(t, port) => {
//     const result = fetch(`http://localhost:${port}`);
//     const response = await result;

//     validateResponseHeaders(t, response);

//     const body = await response.text();
//     t.regex(body, /React App/gm);
//   })
// );

// eslint has `engines: { node: ">^6.14.0 || ^8.10.0 || >=9.10.0" }` in its `package.json`
if (satisfies(process.version, '>^6.14.0 || ^8.10.0 || >=9.10.0')) {
  test(
    '[now dev] 05-gatsby',
    testFixtureStdio('05-gatsby', async (t, port) => {
      const result = fetch(`http://localhost:${port}`);
      const response = await result;

      validateResponseHeaders(t, response);

      const body = await response.text();
      t.regex(body, /Gatsby Default Starter/gm);
    })
  );
} else {
  console.log(
    'Skipping `05-gatsby` test since it requires Node >= ^6.14.0 || ^8.10.0 || >=9.10.0'
  );
}

// mini-css-extract-plugin has `engines: { node: ">= 6.9.0 <7.0.0 || >= 8.9.0" }` in its `package.json`
if (satisfies(process.version, '>= 6.9.0 <7.0.0 || >= 8.9.0')) {
  test(
    '[now dev] 06-gridsome',
    testFixtureStdio('06-gridsome', async (t, port) => {
      const result = fetch(`http://localhost:${port}`);
      const response = await result;

      validateResponseHeaders(t, response);

      const body = await response.text();
      t.regex(body, /Hello, world!/gm);
    })
  );
} else {
  console.log(
    'Skipping `06-gridsome` test since it requires Node >= 6.9.0 <7.0.0 || >= 8.9.0'
  );
}

test(
  '[now dev] 07-hexo-node',
  testFixtureStdio('07-hexo-node', async (t, port) => {
    const result = await fetchWithRetry(`http://localhost:${port}`, 180);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Hexo \+ Node.js API/gm);
  })
);

test(
  '[now dev] 08-hugo',
  testFixtureStdio('08-hugo', async (t, port) => {
    const result = fetch(`http://localhost:${port}`);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Hugo on ZEIT Now/gm);
  })
);

test('[now dev] 10-nextjs-node', async t => {
  const directory = fixture('10-nextjs-node');
  const { dev, port } = await testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const result = await fetchWithRetry(`http://localhost:${port}`, 80);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Next.js \+ Node.js API/gm);
  } finally {
    dev.kill('SIGTERM');
  }
});

// test('[now dev] 11-nuxtjs-node', async t => {
//   const directory = fixture('11-nuxtjs-node');
//   const { dev, port } = await testFixture(directory);

//   try {
//     // start `now dev` detached in child_process
//     dev.unref();

//     const result = await fetchWithRetry(`http://localhost:${port}`, 180);
//     const response = await result;

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

    const result = await fetchWithRetry(`http://localhost:${port}`, 180);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Polymer \+ Node.js API/gm);
  } finally {
    dev.kill('SIGTERM');
  }
});

test('[now dev] 13-preact-node', async t => {
  const directory = fixture('13-preact-node');
  const { dev, port } = await testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const result = await fetchWithRetry(`http://localhost:${port}`, 180);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Preact \+ Node.js API/gm);
  } finally {
    dev.kill('SIGTERM');
  }
});

test('[now dev] 14-svelte-node', async t => {
  const directory = fixture('14-svelte-node');
  const { dev, port } = await testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const result = await fetchWithRetry(`http://localhost:${port}`, 80);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Svelte \+ Node.js API/gm);
  } finally {
    dev.kill('SIGTERM');
  }
});

// test('[now dev] 15-umijs-node', async t => {
//   const directory = fixture('15-umijs-node');
//   const { dev, port } = await testFixture(directory);

//   try {
//     // start `now dev` detached in child_process
//     dev.unref();

//     const result = await fetchWithRetry(`http://localhost:${port}`, 80);
//     const response = await result;

//     validateResponseHeaders(t, response);

//     const body = await response.text();
//     t.regex(body, /UmiJS \+ Node.js API/gm);

//   } finally {
//     dev.kill('SIGTERM')
//   }
// });

if (satisfies(process.version, '^8.12.0 || >=9.7.0')) {
  test('[now dev] 16-vue-node', async t => {
    const directory = fixture('16-vue-node');
    const { dev, port } = await testFixture(directory);

    try {
      // start `now dev` detached in child_process
      dev.unref();

      const result = await fetchWithRetry(`http://localhost:${port}`, 180);
      const response = await result;

      validateResponseHeaders(t, response);

      const body = await response.text();
      t.regex(body, /Vue.js \+ Node.js API/gm);
    } finally {
      dev.kill('SIGTERM');
    }
  });
  test('[now dev] 17-vuepress-node', async t => {
    const directory = fixture('17-vuepress-node');
    const { dev, port } = await testFixture(directory);

    try {
      // start `now dev` detached in child_process
      dev.unref();

      const result = await fetchWithRetry(`http://localhost:${port}`, 180);
      const response = await result;

      validateResponseHeaders(t, response);

      const body = await response.text();
      t.regex(body, /VuePress \+ Node.js API/gm);
    } finally {
      dev.kill('SIGTERM');
    }
  });
} else {
  console.log(
    'Skipping `10-vue-node` and `17-vuepress-node` test since it requires Node ^8.12.0 || >=9.7.0'
  );
}

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
    dev.kill('SIGTERM');
  }
});

// eslint has `engines: { node: ">^6.14.0 || ^8.10.0 || >=9.10.0" }` in its `package.json`
if (satisfies(process.version, '>^6.14.0 || ^8.10.0 || >=9.10.0')) {
  test(
    '[now dev] 18-marko',
    testFixtureStdio('18-marko', async (t, port) => {
      const result = fetch(`http://localhost:${port}`);
      const response = await result;

      validateResponseHeaders(t, response);

      const body = await response.text();
      t.regex(body, /Marko Starter/gm);
    })
  );
} else {
  console.log(
    'Skipping `18-marko` test since it requires Node >= ^6.14.0 || ^8.10.0 || >=9.10.0'
  );
}

test(
  '[now dev] 19-mithril',
  testFixtureStdio('19-mithril', async (t, port) => {
    const result = fetch(`http://localhost:${port}`);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Mithril on ZEIT Now/gm);
  })
);

test(
  '[now dev] 20-riot',
  testFixtureStdio('20-riot', async (t, port) => {
    const result = fetch(`http://localhost:${port}`);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Riot on ZEIT Now/gm);
  })
);

// @static/charge has `engines: { node: ">= 8.10.0" }` in its `package.json`
if (satisfies(process.version, '>= 8.10.0')) {
  test(
    '[now dev] 21-charge',
    testFixtureStdio('21-charge', async (t, port) => {
      const result = fetch(`http://localhost:${port}`);
      const response = await result;

      validateResponseHeaders(t, response);

      const body = await response.text();
      t.regex(body, /Welcome to my new Charge site/gm);
    })
  );
} else {
  console.log('Skipping `21-charge` test since it requires Node >= 8.10.0');
}

test(
  '[now dev] 22-brunch',
  testFixtureStdio('22-brunch', async (t, port) => {
    const result = fetch(`http://localhost:${port}`);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Bon Appétit./gm);
  })
);

// react-dev-utils has `engines: { node: ">= 8.10" }` in its `package.json`
if (satisfies(process.version, '>= 8.10')) {
  test(
    '[now dev] 23-docusaurus',
    testFixtureStdio('23-docusaurus', async (t, port) => {
      const result = fetch(`http://localhost:${port}`);
      const response = await result;

      validateResponseHeaders(t, response);

      const body = await response.text();
      t.regex(body, /Test Site · A website for testing/gm);
    })
  );
} else {
  console.log('Skipping `23-docusaurus` test since it requires Node >= 8.10');
}

// eslint has `engines: { node: ">^6.14.0 || ^8.10.0 || >=9.10.0" }` in its `package.json`
if (satisfies(process.version, '>^6.14.0 || ^8.10.0 || >=9.10.0')) {
  test(
    '[now dev] 24-ember',
    testFixtureStdio('24-ember', async (t, port) => {
      const result = fetch(`http://localhost:${port}`);
      const response = await result;

      validateResponseHeaders(t, response);

      const body = await response.text();
      t.regex(body, /HelloWorld/gm);
    })
  );
} else {
  console.log(
    'Skipping `24-ember` test since it requires Node >= ^6.14.0 || ^8.10.0 || >=9.10.0'
  );
}

test('[now dev] temporary directory listing', async t => {
  const directory = fixture('temporary-directory-listing');
  const { dev, port } = await testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    await sleep(ms('20s'));

    const firstResponse = await fetch(`http://localhost:${port}`, 180);
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
    dev.kill('SIGTERM');
  }
});

test('[now dev] add a `package.json` to trigger `@now/static-build`', async t => {
  const directory = fixture('trigger-static-build');
  const { dev, port } = await testFixture(directory);

  try {
    dev.unref();

    {
      const response = await fetchWithRetry(`http://localhost:${port}`, 180);
      validateResponseHeaders(t, response);
      const body = await response.text();
      t.is(body.trim(), 'hello:index.txt');
    }

    const rnd = Math.random().toString();
    const pkg = {
      scripts: { build: `mkdir -p public && echo ${rnd} > public/index.txt` },
    };
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify(pkg)
    );

    // Wait until file events have been processed
    await sleep(ms('3s'));

    {
      const response = await fetchWithRetry(`http://localhost:${port}`, 180);
      validateResponseHeaders(t, response);
      const body = await response.text();
      t.is(body.trim(), rnd);
    }
  } finally {
    dev.kill('SIGTERM');
  }
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
    dev.kill('SIGTERM');
  }
});

if (satisfies(process.version, '^8.10.0 || ^10.13.0 || >=11.10.1')) {
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
} else {
  console.log(
    'Skipping `do not recursivly check the path` test since it requires Node ^8.10.0 || ^10.13.0 || >=11.10.1'
  );
}

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
    dev.kill('SIGTERM');
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
    dev.kill('SIGTERM');
  }
});

if (satisfies(process.version, '>= 8.9.0')) {
  test('[now dev] 25-nextjs-src-dir', async t => {
    const directory = fixture('25-nextjs-src-dir');
    const { dev, port } = await testFixture(directory);

    try {
      // start `now dev` detached in child_process
      dev.unref();

      const result = await fetchWithRetry(`http://localhost:${port}`, 80);
      const response = await result;

      validateResponseHeaders(t, response);

      const body = await response.text();
      t.regex(body, /Next.js \+ Node.js API/gm);
    } finally {
      dev.kill('SIGTERM');
    }
  });
} else {
  console.log(
    'Skipping `25-nextjs-src-dir` test since it requires Node >= 8.9.0'
  );
}

test.only(
  '[now dev] Use runtime from the functions property',
  testFixtureStdio('custom-runtime', async (t, port) => {
    const result = await fetchWithRetry(`http://localhost:${port}/api/user`, 3);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Hello, from Bash!/gm);
  })
);
