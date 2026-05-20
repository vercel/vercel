// Synthesizes the post-build layout produced by a vite project that uses
// the Environments API with one `client` and one `server` environment.
// Mirrors what TanStack Start / React Router v7 / Hydrogen leave on disk:
// distinct dist/client and dist/server directories, with the server entry
// at the root of its outDir.
const fs = require('fs');
const path = require('path');

const clientDir = path.join(__dirname, 'dist', 'client');
const serverDir = path.join(__dirname, 'dist', 'server');

fs.mkdirSync(path.join(clientDir, 'assets'), { recursive: true });
fs.mkdirSync(serverDir, { recursive: true });

fs.writeFileSync(path.join(clientDir, 'index.html'), '<h1>Client SPA</h1>\n');
fs.writeFileSync(
  path.join(clientDir, 'assets', 'main.js'),
  'console.log("client")\n'
);
fs.writeFileSync(
  path.join(serverDir, 'server.js'),
  `// Minimal web-fetch handler, same shape vite SSR builds emit.
export default {
  async fetch() {
    return new Response('ok');
  },
};
`
);
