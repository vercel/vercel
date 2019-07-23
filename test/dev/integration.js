import ms from 'ms';
import test from 'ava';
import path from 'path';
import execa from 'execa';
import fetch from 'node-fetch';
import sleep from 'then-sleep';
import { promises as fs } from 'fs';

let port = 3000;
const binaryPath = path.resolve(__dirname, `../../dist/index.js`);
const fixture = name => path.join('test', 'dev', 'fixtures', name);

function fetchWithRetry(url, retries = 3) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(url);

      if(res.ok) {
        resolve(res)
      }
    } catch (error) {
      if (retries === 0) {
        reject(error);
        return;
      }
      setTimeout(() => {
        fetchWithRetry(url, retries - 1)
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

function testFixture(directory, opts = {}) {
  port = ++port;
  return {
    dev: execa(binaryPath, ['dev', directory, '-p', port], {
      reject: false,
      detached: true,
      stdio: 'ignore',
      ...opts
    }),
    port
  };
}

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
    dev.kill('SIGTERM')
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
    dev.kill('SIGTERM')
  }
});

test('[now dev] 02-angular-node', async t => {
  const directory = fixture('02-angular-node');
  const { dev, port } = testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const result = await fetchWithRetry(`http://localhost:${port}`, 180);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Angular \+ Node.js API/gm);

  } finally {
    dev.kill('SIGTERM')
  }
});

// test('[now dev] 03-aurelia-node', async t => {
//   const directory = fixture('03-aurelia-node');
//   const { dev, port } = testFixture(directory);
//   try {
//     // start `now dev` detached in child_process
//     dev.unref();

//     const result = await fetchWithRetry(`http://localhost:${port}`, 160);
//     const response = await result;

//     validateResponseHeaders(t, response);

//     const body = await response.text();
//     t.regex(body, /Aurelia \+ Node.js API/gm);

//   } finally {
//     dev.kill('SIGTERM')
//   }
// });

// test('[now dev] 04-create-react-app-node', async t => {
//   const directory = fixture('04-create-react-app-node');
//   const { dev, port } = testFixture(directory);

//   try {
//     // start `now dev` detached in child_process
//     dev.unref();

//     const result = await fetchWithRetry(`http://localhost:${port}`, 180);
//     const response = await result;

//     validateResponseHeaders(t, response);

//     const body = await response.text();
//     t.regex(body, /Create React App \+ Node.js API/gm);

//   } finally {
//     dev.kill('SIGTERM')
//   }
// });

// test('[now dev] 05-gatsby-node', async t => {
//   const directory = fixture('05-gatsby-node');
//   const { dev, port } = testFixture(directory);

//   try {
//     // start `now dev` detached in child_process
//     dev.unref();

//     const result = await fetchWithRetry(`http://localhost:${port}`, 80);
//     const response = await result;

//     validateResponseHeaders(t, response);

//     const body = await response.text();
//     t.regex(body, /Gatsby \+ Node.js API/gm);

//   } finally {
//     dev.kill('SIGTERM')
//   }
// });

// test('[now dev] 06-gridsome-node', async t => {
//   const directory = fixture('06-gridsome-node');
//   const { dev, port } = testFixture(directory);

//   try {
//     // start `now dev` detached in child_process
//     dev.unref();

//     const result = await fetchWithRetry(`http://localhost:${port}`, 80);
//     const response = await result;

//     validateResponseHeaders(t, response);

//     const body = await response.text();
//     t.regex(body, /Gridsome \+ Node.js API/gm);

//   } finally {
//     dev.kill('SIGTERM')
//   }
// });

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
    dev.kill('SIGTERM')
  }
});


// test('[now dev] 08-hugo-node', async t => {
//   const directory = fixture('08-hugo-node');
//   const { dev, port } = testFixture(directory);

//   try {
//     // start `now dev` detached in child_process
//     dev.unref();

//     const result = await fetchWithRetry(`http://localhost:${port}`, 280);
//     const response = await result;

//     validateResponseHeaders(t, response);

//     const body = await response.text();
//     t.regex(body, /Hugo \+ Node.js API/gm);

//   } finally {
//     dev.kill('SIGTERM')
//   }
// });

// test('[now dev] 09-jekyll-node', async t => {
//   const directory = fixture('09-jekyll-node');
//   const { dev, port } = testFixture(directory);

//   try {
//     // start `now dev` detached in child_process
//     dev.unref();

//     const result = await fetchWithRetry(`http://localhost:${port}`, 180);
//     const response = await result;

//     validateResponseHeaders(t, response);

//     const body = await response.text();
//     t.regex(body, /Jekyll \+ Node.js API/gm);

//   } finally {
//     dev.kill('SIGTERM')
//   }
// });

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
    dev.kill('SIGTERM')
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
    dev.kill('SIGTERM')
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
    dev.kill('SIGTERM')
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
    dev.kill('SIGTERM')
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
    dev.kill('SIGTERM')
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
    dev.kill('SIGTERM')
  }
});

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
        t.is(body, 'hello')
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
    const pkg = { scripts: { build: `mkdir -p public && echo ${rnd} > public/index.txt` } };
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify(pkg));

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

test.only('[now dev] no build matches warning', async t => {
  const directory = fixture('no-build-matches');
  const { dev, port } = testFixture(directory, {
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
