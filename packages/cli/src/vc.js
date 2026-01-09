#!/usr/bin/env node
// This shim defers loading the real module until the compile cache is enabled.
// https://nodejs.org/api/module.html#moduleenablecompilecachecachedir
import { enableCompileCache } from 'node:module';

try {
  if (enableCompileCache) {
    enableCompileCache();
  }
} catch {}

await import('./index.js');
