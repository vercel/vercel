import { IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';

const func = (req: IncomingMessage, res: ServerResponse) => {
  if (req.url) {
    const url = parse(req.url);
    let pathname = url.pathname;
    if (pathname && pathname.slice(-1) === '/') {
      // remove all leading `/`s, keep one
      pathname = pathname.replace(/^\/+/g, '/');
      const location = pathname.slice(0, -1) + (url.search ? url.search : '');
      /*res.writeHead(302, {
        Location: location
      })*/
      res.end(`trailing-redirect:RANDOMNESS_PLACEHOLDER:${location}`);
    }
  }
};

export default func;
