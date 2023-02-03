import {
  AbortController as NodeAbortController,
  createRequestHandler as createRemixRequestHandler,
  Headers as NodeHeaders,
  Request as NodeRequest,
  writeReadableStreamToWritable,
} from '@remix-run/node';
import build from './index.js';

const handleRequest = createRemixRequestHandler(build, process.env.NODE_ENV);

function createRemixHeaders(requestHeaders) {
  let headers = new NodeHeaders();

  for (let key in requestHeaders) {
    let header = requestHeaders[key];
    // set-cookie is an array (maybe others)
    if (Array.isArray(header)) {
      for (let value of header) {
        headers.append(key, value);
      }
    } else {
      headers.append(key, header);
    }
  }

  return headers;
}

function createRemixRequest(req, res) {
  let host = req.headers['x-forwarded-host'] || req.headers['host'];
  // doesn't seem to be available on their req object!
  let protocol = req.headers['x-forwarded-proto'] || 'https';
  let url = new URL(req.url, `${protocol}://${host}`);

  // Abort action/loaders once we can no longer write a response
  let controller = new NodeAbortController();
  res.on('close', () => controller.abort());

  let init = {
    method: req.method,
    headers: createRemixHeaders(req.headers),
    // Cast until reason/throwIfAborted added
    // https://github.com/mysticatea/abort-controller/issues/36
    signal: controller.signal,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req;
  }

  return new NodeRequest(url.href, init);
}

async function sendRemixResponse(res, nodeResponse) {
  res.statusCode = nodeResponse.status;
  res.statusMessage = nodeResponse.statusText;
  for (const [name, value] of nodeResponse.headers.entries()) {
    res.setHeader(name, value);
  }

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
