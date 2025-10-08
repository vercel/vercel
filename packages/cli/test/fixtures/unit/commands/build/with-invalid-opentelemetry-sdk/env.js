const fs = require('fs');
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/env.json', JSON.stringify(process.env));
