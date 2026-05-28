const fs = require('fs');
fs.mkdirSync('.vercel/output/static', { recursive: true });
fs.writeFileSync('.vercel/output/config.json', '{}');
fs.writeFileSync(
  '.vercel/output/static/index.html',
  '<h1>Nitro cron test</h1>'
);
