const path = require('node:path');
const fs = require('node:fs');
const world = require('app-2');

const dist = path.join(__dirname, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist);
fs.writeFileSync(path.join(dist, 'index.txt'), `Hello, ${world}`);
