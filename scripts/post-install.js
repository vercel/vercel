#!/usr/bin/env node
import login from '../lib/login';
import chalk from 'chalk';

console.log(`> ${chalk.bold('Authenticating…')}`);

login()
.then(() => {
  console.log('> Logged in successfully. Token saved in ~/.now.json');
  process.exit(0);
})
.catch((err) => {
  console.error(`> Error. Login filed. Run \`now --login\` to retry.`);
});
