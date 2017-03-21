#!/usr/bin/env node

// Native
const { resolve } = require('path');

// Packages
const nodeVersion = require('node-version');
const updateNotifier = require('update-notifier');
const chalk = require('chalk');

// Ours
const { error } = require('../lib/error');
const pkg = require('../lib/pkg');

// Throw an error if node version is too low
if (nodeVersion.major < 6) {
  error('Now requires at least version 6 of Node. Please upgrade!');
  process.exit(1);
}

if (!process.pkg) {
  const notifier = updateNotifier({ pkg });
  const update = notifier.update;

  if (update) {
    let message = `Update available! ${chalk.red(update.current)} → ${chalk.green(update.latest)} \n`;
    message += `Run ${chalk.magenta('npm i -g now')} to update!\n`;
    message += `${chalk.magenta('Changelog:')} https://github.com/zeit/now-cli/releases/tag/${update.latest}`;

    notifier.notify({ message });
  }
}

// This command will be run if no other sub command is specified
const defaultCommand = 'deploy';

const commands = new Set([
  defaultCommand,
  'help',
  'list',
  'ls',
  'rm',
  'remove',
  'alias',
  'aliases',
  'ln',
  'domain',
  'domains',
  'dns',
  'cert',
  'certs',
  'secret',
  'secrets',
  'cc',
  'billing',
  'upgrade',
  'downgrade',
  'open'
]);

const aliases = new Map([
  ['ls', 'list'],
  ['rm', 'remove'],
  ['ln', 'alias'],
  ['aliases', 'alias'],
  ['domain', 'domains'],
  ['cert', 'certs'],
  ['secret', 'secrets'],
  ['cc', 'billing'],
  ['downgrade', 'upgrade']
]);

let cmd = defaultCommand;
const args = process.argv.slice(2);
const index = args.findIndex(a => commands.has(a));

if (index > -1) {
  cmd = args[index];
  args.splice(index, 1);

  if (cmd === 'help') {
    if (index < args.length && commands.has(args[index])) {
      cmd = args[index];
      args.splice(index, 1);
    } else {
      cmd = defaultCommand;
    }

    args.unshift('--help');
  }

  cmd = aliases.get(cmd) || cmd;
}

const bin = resolve(__dirname, 'now-' + cmd + '.js');

// Prepare process.argv for subcommand
process.argv = process.argv.slice(0, 2).concat(args);

// Load sub command
// With custom parameter to make "pkg" happy
require(bin, 'may-exclude');
