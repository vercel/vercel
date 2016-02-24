import readline from 'readline';
import fetch from 'isomorphic-fetch';
import { stringify as stringifyQuery } from 'querystring';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function readEmail () {
  return new Promise((reject, resolve) => {
    rl.question('> Enter your email address: ', resolve);
  });
}

async function getVerificationToken (email) {
  const res = await fetch('http://localhost:3001/', {
    method: 'POST',
    body: { email }
  });

  const body = await res.json();
  return body.token;
}

async function verify (email, verificationToken) {
  const query = {
    email,
    token: verificationToken
  };

  const res = await fetch('http://localhost:3001?' + stringifyQuery(query));

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
      const res = await verify(email, verificationToken);
      final = res.token;
    } catch (e) {}
  } while (!final);

  return { email, token: final };
}

register().then(({ email, token }) => {
  console.log('got email', email);
  console.log('got final token', token);
});
