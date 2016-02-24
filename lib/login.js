import { homedir } from 'os';
import { join as pathJoin } from 'path';
import readline from 'readline';
import fs from 'fs-promise';
import fetch from 'node-fetch';
import { stringify as stringifyQuery } from 'querystring';

const stdin = process.openStdin();

function readEmail () {
  return new Promise((resolve, reject) => {
    process.stdout.write('> Enter your email address: ');
    stdin.on('data', (d) => {
      resolve(d.toString().trim());
    });
  });
}

async function getVerificationToken (email) {
  const data = JSON.stringify({ email });
  const res = await fetch('http://localhost:3001/', {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    },
    body: data
  });

  const body = await res.json();
  return body.token;
}

async function verify (email, verificationToken) {
  const query = {
    email,
    token: verificationToken
  };

  const res = await fetch('http://localhost:3001/verify?' + stringifyQuery(query));

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

  console.log('> Please follow the link in your email to log in.');

  let final;
  do {
    await sleep(5000);
    try {
      final = await verify(email, verificationToken);
    } catch (e) {}
  } while (!final);

  return { email, token: final };
}

export default function () {
  return register().then((loginData) => {
    return fs.writeFile(pathJoin(homedir(), '.now.json'), JSON.stringify(loginData));
  });
}
