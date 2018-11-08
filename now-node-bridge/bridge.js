const assert = require('assert');
const http = require('http');

class Bridge {
  constructor () {
    this.launcher = this.launcher.bind(this);
  }

  launcher (event) {
    return new Promise((resolve, reject) => {
      if (this.userError) {
        console.error('Error while initializing entrypoint:', this.userError);
        return resolve({ statusCode: 500, body: '' });
      }

      if (!this.port) {
        return resolve({ statusCode: 504, body: '' });
      }

      let method, path, headers, body;

      if (event.Action === 'Invoke') {
        event = JSON.parse(event.body);
        method = event.method;
        path = event.path;
        headers = event.headers;
        if (event.body) {
          assert(event.encoding === 'base64'); // do we support anything else?
          body = Buffer.from(event.body, event.encoding);
        }
      } else {
        method = event.httpMethod;
        path = event.path;
        headers = event.headers;
        body = event.body;
      }

      const opts = {
        hostname: '127.0.0.1',
        port: this.port,
        path,
        method,
        headers
      };

      const req = http.request(opts, (resp) => {
        const respBodyChunks = [];
        resp.on('data', (chunk) => respBodyChunks.push(Buffer.from(chunk)));
        resp.on('error', (error) => reject(error));
        resp.on('end', () => {
          delete resp.headers.connection;
          delete resp.headers['content-length'];

          resolve({
            statusCode: resp.statusCode,
            headers: resp.headers,
            body: Buffer.concat(respBodyChunks).toString('base64'),
            encoding: 'base64'
          });
        });
      });

      if (body) req.write(body);
      req.end();
    });
  }
}

module.exports = {
  Bridge
};
