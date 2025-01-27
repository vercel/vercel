const fs = require('fs');

// generate 200MB file which will be traced in `/api/hello`
fs.writeFileSync('data.txt', Buffer.alloc(150 * 1024 * 1024));

module.exports = {};
