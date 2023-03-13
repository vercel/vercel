import {
  AbortController as NodeAbortController,
  createRequestHandler as createRemixRequestHandler,
  Headers as NodeHeaders,
  Request as NodeRequest,
  writeReadableStreamToWritable,
  installGlobals,
} from '@remix-run/node';

installGlobals();

import build from '@remix-run/dev/server-build';

const handleRequest = createRemixRequestHandler(build, process.env.NODE_ENV);

function createRemixHeaders(requestHeaders) {
  const headers = new NodeHeaders();

  for (const key in requestHeaders) {
    const header = requestHeaders[key];
    // set-cookie is an array (maybe others)
    if (Array.isArray(header)) {
      for (const value of header) {
        headers.append(key, value);
      }
    } else {
      headers.append(key, header);
    }
  }

  return headers;
}

function createRemixRequest(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const url = new URL(req.url, `${protocol}://${host}`);

  // Abort action/loaders once we can no longer write a response
  const controller = new NodeAbortController();
  res.on('close', () => controller.abort());

  const init = {
    method: req.method,
    headers: createRemixHeaders(req.headers),
    signal: controller.signal,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req;
  }

  return new NodeRequest(url.href, init);
}

async function sendRemixResponse(res, nodeResponse) {
  res.statusMessage = nodeResponse.statusText;
  let multiValueHeaders = nodeResponse.headers.raw();
  res.writeHead(
    nodeResponse.status,
    nodeResponse.statusText,
    multiValueHeaders
  );

  if (nodeResponse.body) {
    await writeReadableStreamToWritable(nodeResponse.body, res);
  } else {
    res.end();
  }
}

export default async (req, res) => {
  const request = createRemixRequest(req, res);
  const response = await handleRequest(request);
  await sendRemixResponse(res, response);
};
