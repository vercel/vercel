import { IncomingMessage, ServerResponse } from 'http';
import next from 'next-server';
import url from 'url';

if (!process.env.NODE_ENV) {
  const region = process.env.VERCEL_REGION || process.env.NOW_REGION;
  process.env.NODE_ENV = region === 'dev1' ? 'development' : 'production';
}

const app = next({});

module.exports = (req: IncomingMessage, res: ServerResponse) => {
  const repoInfo = url.parse(req.url || '', true);
  app.render(req, res, 'PATHNAME_PLACEHOLDER', repoInfo.query, repoInfo);
};
