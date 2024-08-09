const http = require('http');

async function main() {
  console.log('Starting to build...');

  const server = http.createServer((req, res) => {
    console.log(`> Request ${req.url}`);
    res.end(`Time of Creation: ${Date.now()}`);
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Started server on port ${port}`);
  });

  await new Promise((resolve, reject) => {
    server.on('close', () => resolve());
    server.on('error', error => reject(error));
  });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
