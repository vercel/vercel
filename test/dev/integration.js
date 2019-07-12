import test from 'ava';
import path from 'path';
import execa from 'execa';
import fetch from 'node-fetch';

import { URL } from 'url';

const binary = {
  darwin: 'now-macos',
  linux: 'now-linux',
  win32: 'now-win.exe'
}[process.platform];

const binaryPath = path.resolve(__dirname, `../../packed/${binary}`);
const fixture = name => path.join('test', 'dev', 'fixtures', name);
const session = Math.random()
  .toString(36)
  .split('.')[1];

test('list directory', async t => {
  const directory = fixture('00-list-directory');

  const dev = await execa(binaryPath, ['dev', directory], {
    reject: false
  }).stdout.pipe(process.stdout);


  dev.stdout.on('data', data => {
    console.log(data)
  });

  // try {
  //   // start now dev server
  //   const response = await fetch('http://localhost:3000');
  //   console.log(response.body);
  // } finally {
  // }

  await dev.kill('SIGTERM', {
    forceKillAfterTimeout: 5000
  });

  // const { stdout } = await subprocess;
  // console.log(stdout);

  // const { href, host } = new URL(stdout);
  // console.log(href,host);

  t.pass();
});
