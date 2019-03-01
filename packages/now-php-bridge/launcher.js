/* eslint-disable prefer-template */

const assert = require('assert');
const fs = require('fs');
const { join: pathJoin } = require('path');
const { parse: parseUrl } = require('url');
const { query } = require('./fastcgi/index.js');

function normalizeEvent(event) {
  if (event.Action === 'Invoke') {
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
      method, path, headers, body,
    };
  }

  const {
    httpMethod: method, path, headers, body,
  } = event;

  return {
    method, path, headers, body,
  };
}

function isDirectory(p) {
  return new Promise((resolve) => {
    fs.stat(p, (error, s) => {
      if (error) {
        resolve(false);
        return;
      }

      if (s.isDirectory()) {
        resolve(true);
        return;
      }

      resolve(false);
    });
  });
}

async function transformFromAwsRequest({
  method, path, headers, body,
}) {
  const { pathname, search, query: queryString } = parseUrl(path);
  let requestUri = pathname + (search || '');

  let filename = pathJoin('/var/task/user',
    process.env.NOW_ENTRYPOINT || pathname);
  if (await isDirectory(filename)) {
    if (!filename.endsWith('/')) {
      filename += '/';
      requestUri = pathname + '/' + (search || '');
    }
    filename += 'index.php';
  }

  const params = {};
  params.REQUEST_METHOD = method;
  params.REQUEST_URI = requestUri;
  params.QUERY_STRING = queryString || ''; // can be null
  params.SCRIPT_FILENAME = filename;
  params.SERVER_PROTOCOL = 'HTTP/1.1';
  params.SERVER_PORT = 443;
  params.HTTPS = 'on';

  // eslint-disable-next-line no-restricted-syntax
  for (const [k, v] of Object.entries(headers)) {
    const camel = k.toUpperCase().replace(/-/g, '_');
    params[`HTTP_${camel}`] = v;
    if (camel === 'HOST') {
      params.SERVER_NAME = v;
    } else
    if (['CONTENT_TYPE', 'CONTENT_LENGTH'].includes(camel)) {
      params[camel] = v; // without HOST_ prepended
    }
  }

  return { params, stdin: body };
}

function transformToAwsResponse({ tuples, body }) {
  let statusCode = 200;
  const headers = {};
  // eslint-disable-next-line no-param-reassign
  if (!body) body = Buffer.alloc(0);
  assert(Buffer.isBuffer(body));

  for (let i = 0; i < tuples.length; i += 2) {
    const k = tuples[i].toLowerCase();
    const v = tuples[i + 1];
    if (k === 'status') {
      statusCode = Number(v.split(' ')[0]); // '408 Request Timeout'
    } else {
      if (!headers[k]) headers[k] = [];
      headers[k].push(v);
    }
  }

  return {
    statusCode,
    headers,
    body: body.toString('base64'),
    encoding: 'base64',
  };
}

async function launcher(event) {
  const awsRequest = normalizeEvent(event);
  const input = await transformFromAwsRequest(awsRequest);
  const output = await query(input);
  return transformToAwsResponse(output);
}

exports.launcher = launcher;

/*
(async function() {
  console.log(await launcher({
    httpMethod: 'GET',
    path: '/phpinfo.php'
  }));
})();
*/
