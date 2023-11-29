#!/usr/bin/env node

/**
 * This script generates a cache key before invoking turbo
 * so that we never accidentally use the wrong cache.
 */
const { writeFileSync } = require('fs');
const { join } = require('path');

const { versions, platform, arch, env } = process;
const file = join(__dirname, '..', 'turbo-cache-key.json');
const node = versions.node.split('.')[0];
const str = JSON.stringify({
  node,
  platform,
  arch,
  imageVersion: env.ImageVersion ?? null,
});
console.log(`Generating cache key: ${str}`);
writeFileSync(file, str);
