import { IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';

const func = (req: IncomingMessage, res: ServerResponse) => {
  if (req.url) {
    const { pathname, search } = parse(req.url);
    const location = pathname
      ? pathname.replace(/\/+/g, '/') + (search ? search : '')
      : '/';
    /*
    res.writeHead(302, {
      Location: location
    });*/
    res.end(`double-redirect:RANDOMNESS_PLACEHOLDER:${location}`);
  }
};

export default func;
