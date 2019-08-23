import { IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';

const func = (req: IncomingMessage, res: ServerResponse) => {
  const { referer } = req.headers;
  if (!referer) {
    res.writeHead(302, { Location: `/404` });
    return;
  }
  const {
    host,
    query: { section },
  } = parse(referer, true);
  res.writeHead(302, { Location: `/deployments/${host}/${section}` });
  res.end();
};

export default func;
