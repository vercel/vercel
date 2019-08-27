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

      if (res.ok) {
        resolve(res);
      }
    } catch (error) {
      if (retries === 0) {
        reject(error);
        return;
      }
      setTimeout(() => {
        fetchWithRetry(url, retries - 1, opts)
          .then(resolve)
          .catch(reject);
      }, 1000);
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
    reject: false
  });
}

function formatOutput({ stderr, stdout }) {
  return `Received:\n"${stderr}"\n"${stdout}"`;
}

function testFixture(directory, opts = {}, args = []) {
  port = ++port;
  return {
    dev: execa(binaryPath, ['dev', directory, '-l', String(port), ...args], {
      reject: false,
      detached: true,
      stdio: 'ignore',
      ...opts
    }),
    port
  };
}

function testFixtureStdio(directory, fn) {
  return async t => {
    let dev;
    const dir = fixture(directory);
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
  t.regex(output.stderr, /Invalid `builds` property: \[0\]\.src should be string/gm);
});

test('[now dev] validate routes', async t => {
  const directory = fixture('invalid-routes');
  const output = await exec(directory);

  t.is(output.code, 1, formatOutput(output));
  t.regex(output.stderr, /Invalid `routes` property: \[0\]\.src should be string/gm);
});

test('[now dev] 00-list-directory', async t => {
  const directory = fixture('00-list-directory');
  const { dev, port } = testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const result = await fetchWithRetry(`http://localhost:${port}`, 60);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Files within/gm);
    t.regex(body, /test1.txt/gm);
    t.regex(body, /directory/gm);
  } finally {
    dev.kill('SIGTERM');
  }
});

test('[now dev] 01-node', async t => {
  const directory = fixture('01-node');
  const { dev, port } = testFixture(directory);

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
    const { dev, port } = testFixture(directory, { stdio: 'pipe' }, ['--debug']);

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

test('[now dev] 07-hexo-node', async t => {
  const directory = fixture('07-hexo-node');
  const { dev, port } = testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const result = await fetchWithRetry(`http://localhost:${port}`, 180);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Hexo \+ Node.js API/gm);
  } finally {
    dev.kill('SIGTERM');
  }
});

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
  const { dev, port } = testFixture(directory);

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
//   const { dev, port } = testFixture(directory);

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
  const { dev, port } = testFixture(directory);

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
  const { dev, port } = testFixture(directory);

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
  const { dev, port } = testFixture(directory);

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
//   const { dev, port } = testFixture(directory);

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

test('[now dev] 16-vue-node', async t => {
  const directory = fixture('16-vue-node');
  const { dev, port } = testFixture(directory);

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
  const { dev, port } = testFixture(directory);

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

test('[now dev] double slashes redirect', async t => {
  const directory = fixture('01-node');
  const { dev, port } = testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    // Wait for `now dev` to boot up
    await sleep(ms('10s'));

    {
      const res = await fetch(`http://localhost:${port}////?foo=bar`, {
        redirect: 'manual'
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
        redirect: 'manual'
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

test('[now dev] temporary directory listing', async t => {
  const directory = fixture('temporary-directory-listing');
  const { dev, port } = testFixture(directory);

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
  const { dev, port } = testFixture(directory);

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
      scripts: { build: `mkdir -p public && echo ${rnd} > public/index.txt` }
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
  const { dev } = testFixture(directory, {
    stdio: ['ignore', 'pipe', 'pipe']
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

test('[now dev] do not recursivly check the path', async t => {
  const directory = fixture('handle-filesystem-missing');
  const { dev, port } = testFixture(directory);

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
  const { dev, port } = testFixture(directory, {
    stdio: ['ignore', 'pipe', 'pipe']
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
