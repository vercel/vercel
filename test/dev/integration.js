import test from 'ava';
import path from 'path';
import execa from 'execa';
import fetch from 'node-fetch';

const binary = {
  darwin: 'now-macos',
  linux: 'now-linux',
  win32: 'now-win.exe'
}[process.platform];

let port = 3000;
const binaryPath = path.resolve(__dirname, `../../packed/${binary}`);
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

function testFixture(directory) {
  port = ++port;
  return {
    dev: execa(binaryPath, ['dev', directory, '-p', port], {
      reject: false,
      detached: true,
      stdio: 'ignore'
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

    const result = await fetchWithRetry(`http://localhost:${port}`, 80);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Angular \+ Node.js API/gm);

  } finally {
    dev.kill('SIGTERM')
  }
});

test('[now dev] 03-aurelia-node', async t => {
  const directory = fixture('03-aurelia-node');
  const { dev, port } = testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const result = await fetchWithRetry(`http://localhost:${port}`, 100);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Aurelia \+ Node.js API/gm);

  } finally {
    dev.kill('SIGTERM')
  }
});

test('[now dev] 04-create-react-app-node', async t => {
  const directory = fixture('03-create-react-app-node');
  const { dev, port } = testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const result = await fetchWithRetry(`http://localhost:${port}`, 180);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Create React App \+ Node.js API/gm);

  } finally {
    dev.kill('SIGTERM')
  }
});

test('[now dev] 05-gatsby-node', async t => {
  const directory = fixture('03-gatsby-node');
  const { dev, port } = testFixture(directory);

  try {
    // start `now dev` detached in child_process
    dev.unref();

    const result = await fetchWithRetry(`http://localhost:${port}`, 80);
    const response = await result;

    validateResponseHeaders(t, response);

    const body = await response.text();
    t.regex(body, /Gatsby \+ Node.js API/gm);

  } finally {
    dev.kill('SIGTERM')
  }
});
