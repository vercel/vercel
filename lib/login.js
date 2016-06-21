import os from 'os';
import chalk from 'chalk';
import fetch from 'node-fetch';
import * as cfg from './cfg';
import { stringify as stringifyQuery } from 'querystring';
import { validate } from 'email-validator';
import readEmail from 'email-prompt';
import ua from './ua';
import pkg from '../../package.json';

async function getVerificationToken (url, email) {
  const tokenName = `Now CLI ${os.platform()}-${os.arch()} ${pkg.version} (${os.hostname()})`;
  const data = JSON.stringify({ email, tokenName });
  const res = await fetch(`${url}/now/registration`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'User-Agent': ua
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

  const res = await fetch(`${url}/now/registration/verify?${stringifyQuery(query)}`, {
    headers: { 'User-Agent': ua }
  });
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
  process.stdout.write('\n');

  if (!validate(email)) return register(url, { retryEmail: true });

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
