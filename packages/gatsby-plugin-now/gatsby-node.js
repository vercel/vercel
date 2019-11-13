const path = require('path');
const writeFile = require('util').promisify(require('fs').writeFile);

const REDIRECT_FILE_NAME = '__now_routes_g4t5bY.json';

exports.onPostBuild = async ({ store }) => {
  const { redirects, program } = store.getState();

  if (!redirects.length === 0) {
    return;
  }

  const routes = [{ handle: 'filesystem' }];

  for (const redirect of redirects) {
    const route = {
      src: redirect.fromPath,
      status: redirect.statusCode || (redirect.isPermanent ? 301 : 302),
      headers: { Location: redirect.toPath },
    };

    if (redirect.force) {
      routes.unshift(route);
    } else {
      routes.push(route);
    }
  }

  await writeFile(
    path.join(program.directory, 'public', REDIRECT_FILE_NAME),
    JSON.stringify(routes)
  );
};
