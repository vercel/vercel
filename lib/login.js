import chalk from 'chalk';
import fetch from 'node-fetch';
import * as cfg from './cfg';
import { stringify as stringifyQuery } from 'querystring';

function readEmail () {
  return new Promise((resolve, reject) => {
    process.stdout.write('> Enter your email address: ');
    process.stdin.on('data', (d) => {
      process.stdin.pause();
      resolve(d.toString().trim());
    }).resume();
  });
}

async function getVerificationToken (url, email) {
  const data = JSON.stringify({ email });
  const res = await fetch(`${url}/now/registration`, {
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

async function verify (url, email, verificationToken) {
  const query = {
    email,
    token: verificationToken
  };

  const res = await fetch(`${url}/now/registration/verify?${stringifyQuery(query)}`);
  const body = await res.json();
  return body.token;
}

function sleep (ms) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  });
}

async function register (url) {
  const email = await readEmail();
  const verificationToken = await getVerificationToken(url, email);

  console.log(`> Please follow the link sent to ${chalk.bold(email)} to log in.`);
  process.stdout.write('> Waiting for confirmation..');

  let final;
  do {
    await sleep(2500);
    try {
      final = await verify(url, email, verificationToken);
    } catch (e) {}
    process.stdout.write('.');
  } while (!final);

  process.stdout.write('\n');

  return { email, token: final };
}

export default async function (url) {
  const loginData = await register(url);
  cfg.merge(loginData);
  return loginData.token;
}
