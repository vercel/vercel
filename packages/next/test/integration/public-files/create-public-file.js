const fs = require('fs');

// Adds a new file to the public folder at build time
fs.writeFileSync('public/generated.txt', 'Generated');
