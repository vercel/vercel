const http = require('http');

function normalizeEvent(event) {
  let isApiGateway = true;

  if (event.Action === 'Invoke') {
    isApiGateway = false;
    const invokeEvent = JSON.parse(event.body);

    const {
      method, path, headers, encoding,
    } = invokeEvent;

    let { body } = invokeEvent;

    if (body) {
      if (encoding === 'base64') {
        body = Buffer.from(body, encoding);
      } else if (encoding === undefined) {
        body = Buffer.from(body);
      } else {
        throw new Error(`Unsupported encoding: ${encoding}`);
      }
    }

    return {
      isApiGateway, method, path, headers, body,
    };
  }

  const {
    httpMethod: method, path, headers, body,
  } = event;

  return {
    isApiGateway, method, path, headers, body,
  };
}

class Bridge {
  constructor() {
    this.launcher = this.launcher.bind(this);
  }

  launcher(event) {
    // eslint-disable-next-line consistent-return
    return new Promise((resolve, reject) => {
      if (this.userError) {
        console.error('Error while initializing entrypoint:', this.userError);
        return resolve({ statusCode: 500, body: '' });
      }

      if (!this.port) {
        return resolve({ statusCode: 504, body: '' });
      }

      const {
        isApiGateway, method, path, headers, body,
      } = normalizeEvent(event);

      const opts = {
        hostname: '127.0.0.1',
        port: this.port,
        path,
        method,
        headers,
      };

      const req = http.request(opts, (res) => {
        const response = res;
        const respBodyChunks = [];
        response.on('data', chunk => respBodyChunks.push(Buffer.from(chunk)));
        response.on('error', reject);
        response.on('end', () => {
          const bodyBuffer = Buffer.concat(respBodyChunks);
          delete response.headers.connection;

          if (isApiGateway) {
            delete response.headers['content-length'];
          } else
          if (response.headers['content-length']) {
            response.headers['content-length'] = bodyBuffer.length;
          }

          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: bodyBuffer.toString('base64'),
            encoding: 'base64',
          });
        });
      });

      req.on('error', (error) => {
        setTimeout(() => {
          // this lets express print the true error of why the connection was closed.
          // it is probably 'Cannot set headers after they are sent to the client'
          reject(error);
        }, 2);
      });

      if (body) req.write(body);
      req.end();
    });
  }
}

module.exports = {
  Bridge,
};
