import { IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';

const func = (req: IncomingMessage, res: ServerResponse) => {
  if (req.url) {
    const url = parse(req.url);
    res.writeHead(302, {
      Location: url.pathname
        ? url.pathname.replace(/\/+/g, '/') + (url.search ? url.search : '')
        : '/',
    });
    res.end();
  }
};

export default func;
