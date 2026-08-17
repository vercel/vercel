// Fails with MODULE_NOT_FOUND unless this service's own install ran.
const fs = require('fs');
const message = require('local-dep');

fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/index.txt', message);
