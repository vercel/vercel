const fs = require('fs');
const path = require('path');

fs.rmSync(path.join(__dirname, '.vercel', 'output'), { recursive: true });
fs.mkdirSync(path.join(__dirname, '.vercel', 'output'));
fs.copyFileSync(
  path.join(__dirname, 'output', 'config.json'),
  path.join(__dirname, '.vercel', 'output', 'config.json')
);
