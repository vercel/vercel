#!/usr/bin/env node
const execa = require('execa');
const { join } = require('path');
const { homedir } = require('os');

async function main() {
  process.env.GOOS = 'linux';
  process.env.GOARCH = 'amd64';
  process.env.GOPATH = join(homedir(), 'go');

  await execa('go', ['get', 'github.com/aws/aws-lambda-go/events'], {
    stdio: 'inherit',
  });
  await execa('go', ['get', 'github.com/aws/aws-lambda-go/lambda'], {
    stdio: 'inherit',
  });
  await execa('go', ['build', '-o', 'handler', 'main.go'], {
    stdio: 'inherit',
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
