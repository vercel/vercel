import { Server } from 'http';
import next from 'next-server';
import url from 'url';
import { Bridge } from './now__bridge';

if (!process.env.NODE_ENV) {
  const region = process.env.VERCEL_REGION || process.env.NOW_REGION;
  process.env.NODE_ENV = region === 'dev1' ? 'development' : 'production';
}

const app = next({});

const server = new Server((req, res) => {
  const parsedUrl = url.parse(req.url || '', true);
  app.render(req, res, 'PATHNAME_PLACEHOLDER', parsedUrl.query, parsedUrl);
});

const bridge = new Bridge(server);
bridge.listen();

exports.launcher = bridge.launcher;
