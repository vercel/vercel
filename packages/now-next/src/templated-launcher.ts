if (!process.env.NODE_ENV) {
  process.env.NODE_ENV =
    process.env.NOW_REGION === 'dev1' ? 'development' : 'production';
}

import { Server } from 'http';
import { Bridge } from './now__bridge';
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-var-requires
const page = require(__LAUNCHER_PAGE_PATH__);

// page.render is for React rendering
// page.default is for /api rendering
// page is for module.exports in /api
const server = new Server(page.render || page.default || page);
const bridge = new Bridge(server);
bridge.listen();

exports.launcher = bridge.launcher;
