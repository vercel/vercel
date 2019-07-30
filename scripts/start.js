#!/usr/bin/env node
const { join } = require('path');
const { spawnSync } = require('child_process');

const match = process.version.match(/^v(\d+)\.(\d+)/);
const major = match && parseInt(match[1], 10);
const minor = match && parseInt(match[2], 10);

if (major > 10 || (major === 10 && minor >= 10)) {
  require('../dist/index.js');
} else {
  const [node, _, ...args] = process.argv;
  const script = join(__dirname, '../dist/index.js');
  spawnSync('node', ['--no-warnings', '../dist/index.js', ...args], {
    stdio: 'inherit'
  });
}
