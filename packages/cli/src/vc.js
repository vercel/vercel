#!/usr/bin/env node
'use strict';
// This shim defers loading the real module until the compile cache is enabled.
// https://nodejs.org/api/module.html#moduleenablecompilecachecachedir
try {
  const { enableCompileCache } = require('node:module');
  if (enableCompileCache) {
    enableCompileCache();
  }
} catch {}
require('./index.js');
