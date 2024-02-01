// The Next.js builder can emit the project in a subdirectory depending on how
// many folder levels of `node_modules` are traced. To ensure `process.cwd()`
// returns the proper path, we change the directory to the folder with the
// launcher. This mimics `yarn workspace run` behavior.
process.chdir(__dirname);

if (!process.env.NODE_ENV) {
  const region = process.env.VERCEL_REGION || process.env.NOW_REGION;
  process.env.NODE_ENV = region === 'dev1' ? 'development' : 'production';
}

// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-var-requires
const page = require(__LAUNCHER_PAGE_PATH__);

// page.render is for React rendering
// page.default is for /api rendering
// page is for module.exports in /api
module.exports = page.render || page.default || page;
