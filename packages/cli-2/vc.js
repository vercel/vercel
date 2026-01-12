#!/usr/bin/env node
// This shim defers loading the real module until the compile cache is enabled.
// https://nodejs.org/api/module.html#moduleenablecompilecachecachedir
// enableCompileCache was added in Node.js 22.8.0, so we need to handle older versions.
await import('vercel/vc');
