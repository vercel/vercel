const { cpSync, writeFileSync, mkdirSync } = require('fs');

mkdirSync('.vercel/output', { recursive: true });
cpSync('public', '.vercel/output/static', { recursive: true });

const config = {
  version: 3,
};

writeFileSync('.vercel/output/config.json', JSON.stringify(config, null, 2));

