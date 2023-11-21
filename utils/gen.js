#!/usr/bin/env node

/**
 * This script generates a cache key before invoking turbo
 * so that we never accidentally use the wrong cache.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { versions, platform, arch } = process;
const file = fileURLToPath(new URL('../turbo-cache-key.json', import.meta.url));
const node = versions.node.split('.')[0];
const str = JSON.stringify({ node, platform, arch });
console.log(`Generating cache key: ${str}`);
writeFileSync(file, str);
