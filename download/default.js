#!/usr/bin/env node

// This file should get overwritten if now installs correctly.
// It only exists to tell users that something went wrong
// and how they might fix it.

console.log('> Error!', 'Now CLI failed to install correctly.');
console.log('> Error!', 'Make sure to set `ignore-scripts` to `false` in your npm config before installing Now CLI.');

process.exit(1);
