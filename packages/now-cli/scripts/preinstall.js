#!/usr/bin/env node

function error(command) {
  console.error('> Error!', command);
}

function debug(str) {
  if (
    process.argv.find(str => str === '--debug') ||
    process.env.PREINSTALL_DEBUG
  ) {
    console.log(`[debug] [${new Date().toISOString()}]`, str);
  }
}

function isYarn() {
  return process.env.npm_config_heading !== 'npm';
}

function isGlobal() {
  const cmd = JSON.parse(process.env.npm_config_argv || '{ "original": [] }');

  return isYarn()
    ? cmd.original.includes('global')
    : Boolean(process.env.npm_config_global);
}

function validateNodeVersion() {
  let semver = '>= 0';
  let major = '1';

  try {
    major = process.versions.node.split('.')[0];
    const pkg = require('../package.json');
    semver = pkg.engines.node;
  } catch (e) {
    debug('Failed to read package.json engines');
  }

  const isValid = eval(`${major} ${semver}`);
  return { isValid, expected: semver, actual: process.versions.node };
}

async function main() {
  if (!isGlobal()) {
    debug('Skip preinstall since now is being installed locally');
    return;
  }

  const ver = validateNodeVersion();

  if (!ver.isValid) {
    error(
      `Detected unsupported Node.js version.\n` +
        `Expected "${ver.expected}" but found "${ver.actual}".\n` +
        `Please update to the latest Node.js LTS version to install Now CLI.`
    );
    process.exit(1);
  }
}

process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:');
  console.error(err);
  process.exit(1);
});

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:');
  console.error(err);
  process.exit(1);
});

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
