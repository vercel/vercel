#!/usr/bin/env node

/**
 * This script generates a cache key before invoking turbo
 * so that we never accidentally use the wrong cache.
 */
const { writeFileSync } = require('fs');
const { join } = require('path');
const { execFileSync } = require('child_process');

const { versions, platform, arch } = process;
const file = join(__dirname, '..', 'turbo-cache-key.json');
const node = versions.node.split('.')[0];
const pnpm = execFileSync('pnpm', ['--version']).toString().trim();
const str = JSON.stringify({ node, platform, arch, pnpm });
console.log(`Generating cache key: ${str}`);
writeFileSync(file, str);
