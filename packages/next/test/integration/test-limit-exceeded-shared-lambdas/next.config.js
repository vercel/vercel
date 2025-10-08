const fs = require('fs');
const path = require('path');

// write very large uncompressed data to trigger hitting limit
fs.writeFileSync(
  path.join(__dirname, 'public', 'big-image-2.jpg'),
  Buffer.alloc(200 * 1024 * 1024).fill('a')
);
