// Public gateway service. It is bound to one internal service per runtime and
// reaches each one through the injected binding env var (no public route to the
// targets). Binding values are URL bases ending in "/", so relative paths are
// appended directly per the `new URL("path", BASE)` contract.
const http = require('http');

const port = process.env.PORT || 3000;

async function callBinding(base, path = '') {
  const res = await fetch(new URL(path, base));
  return res.text();
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/binding-info') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          node_api_url: process.env.NODE_API_URL,
          py_api_url: process.env.PY_API_URL,
          go_api_url: process.env.GO_API_URL,
          ruby_api_url: process.env.RUBY_API_URL,
        })
      );
      return;
    }
    if (req.url === '/call/node') {
      res.end(await callBinding(process.env.NODE_API_URL));
      return;
    }
    if (req.url === '/call/py') {
      res.end(await callBinding(process.env.PY_API_URL, 'hello'));
      return;
    }
    if (req.url === '/call/go') {
      res.end(await callBinding(process.env.GO_API_URL, 'ping'));
      return;
    }
    if (req.url === '/call/ruby') {
      res.end(await callBinding(process.env.RUBY_API_URL));
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  } catch (err) {
    res.statusCode = 500;
    res.end(String(err));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`gateway listening on ${port}`);
});
