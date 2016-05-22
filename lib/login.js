import chalk from 'chalk';
import fetch from 'node-fetch';
import * as cfg from './cfg';
import { stringify as stringifyQuery } from 'querystring';
import _emailRegex from 'email-regex';

const emailRegex = _emailRegex({ exact: true });

function readEmail ({ invalid = false } = {}) {
  return new Promise((resolve, reject) => {
    const decorate = invalid ? chalk.red : (v) => v;
    const prompt = decorate('> Enter your email address: ');
    process.stdout.write(prompt);
    const data = [];
    process.stdin.on('data', (d) => {
      data.push(d);
      if (d.indexOf('\n') > -1) {
        process.stdin.pause();
        resolve(Buffer.concat(data).toString().trim());
      }
    });
    process.stdin.resume();
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

async function register (url, { retryEmail = false } = {}) {
  const email = await readEmail({ invalid: retryEmail });
  if (!emailRegex.test(email)) return register(url, { retryEmail: true });

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
