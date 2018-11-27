const fs = require('fs');
const http = require('http');
const path = require('path');

const server = http.createServer((req, resp) => {
  const asset1 = fs.readFileSync(
    path.join(__dirname, 'subdirectory1/asset.txt'),
  );
  const asset2 = fs.readFileSync(
    path.join(__dirname, 'subdirectory2/asset.txt'),
  );
  resp.end(`${asset1},${asset2}`);
});

server.listen();
