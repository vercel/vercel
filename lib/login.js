import { homedir } from 'os';
import { join as pathJoin } from 'path';
import fs from 'fs-promise';
import fetch from 'node-fetch';
import { stringify as stringifyQuery } from 'querystring';
import chalk from 'chalk';

const URL = 'http://api-registration.now.sh';

const stdin = process.openStdin();

function readEmail () {
  return new Promise((resolve, reject) => {
    process.stdout.write('> Enter your email address: ');
    stdin.on('data', (d) => {
      stdin.destroy();
      resolve(d.toString().trim());
    });
  });
}

async function getVerificationToken (email) {
  const data = JSON.stringify({ email });
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    },
    body: data
  });

  if (200 !== res.status) {
    throw new Error('Verification error');
  }

  const body = await res.json();
  return body.token;
}

async function verify (email, verificationToken) {
  const query = {
    email,
    token: verificationToken
  };

  const res = await fetch(`${URL}/verify?${stringifyQuery(query)}`);
  const body = await res.json();
  return body.token;
}

function sleep (ms) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  });
}

async function register () {
  const email = await readEmail();
  const verificationToken = await getVerificationToken(email);

  console.log(`> Please follow the link sent to ${chalk.bold(email)} to log in.`);
  process.stdout.write('> Waiting for confirmation..');

  let final;
  do {
    await sleep(2500);
    try {
      final = await verify(email, verificationToken);
    } catch (e) {}
    process.stdout.write('.');
  } while (!final);

  process.stdout.write('\n');

  return { email, token: final };
}

export default async function () {
  const loginData = await register();
  return fs.writeFile(pathJoin(homedir(), '.now.json'), JSON.stringify(loginData));
}
