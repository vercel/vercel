#!/usr/bin/env node

try {
  // eslint-disable-next-line import/no-unassigned-import
  require('../dist/now.js')
} catch (err) {
  if (err.code === 'ENOENT' && err.syscall === 'uv_cwd') {
    console.error(`Current path doesn't exist!`)
    process.exit(1)
  }
}
