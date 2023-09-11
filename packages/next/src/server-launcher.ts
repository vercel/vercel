import { IncomingMessage, ServerResponse } from 'http';
// The Next.js builder can emit the project in a subdirectory depending on how
// many folder levels of `node_modules` are traced. To ensure `process.cwd()`
// returns the proper path, we change the directory to the folder with the
// launcher. This mimics `yarn workspace run` behavior.
process.chdir(__dirname);

const region = process.env.VERCEL_REGION || process.env.NOW_REGION;

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = region === 'dev1' ? 'development' : 'production';
}

if (process.env.NODE_ENV !== 'production' && region !== 'dev1') {
  console.warn(
    `Warning: NODE_ENV was incorrectly set to "${process.env.NODE_ENV}", this value is being overridden to "production"`
  );
  process.env.NODE_ENV = 'production';
}

// pre-next-server-target

// eslint-disable-next-line
const NextServer = require('__NEXT_SERVER_PATH__').default;
const nextServer = new NextServer({
  // @ts-ignore __NEXT_CONFIG__ value is injected
  conf: __NEXT_CONFIG__,
  dir: '.',
  minimalMode: true,
  customServer: false,
});

// next-server-preload-target

const requestHandler = nextServer.getRequestHandler();

module.exports = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    // entryDirectory handler
    await requestHandler(req, res);
  } catch (err) {
    console.error(err);
    // crash the lambda immediately to clean up any bad module state,
    // this was previously handled in ___vc_bridge on an unhandled rejection
    // but we can do this quicker by triggering here
    process.exit(1);
  }
};
