const path = require('path');
const writeFile = require('util').promisify(require('fs').writeFile);

const REDIRECT_FILE_NAME = '__now_routes_g4t5bY.json';

exports.onPostBuild = async ({ store }) => {
  const { redirects, program } = store.getState();

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

  // we implement gatsby's recommendations
  // https://www.gatsbyjs.org/docs/caching/
  const finalRoutes = [
    {
      src: '^/static/(.*)$',
      headers: { 'cache-control': 'public,max-age=31536000,immutable' },
      continue: true,
    },
    {
      src: '^/.*\\.(js|css)$',
      headers: { 'cache-control': 'public,max-age=31536000,immutable' },
      continue: true,
    },
    {
      src: '^/(sw\\.js|app-data\\.json|.*\\.html|page-data/.*)$',
      headers: { 'cache-control': 'public,max-age=0,must-revalidate' },
      continue: true,
    },
    ...routes,
    { src: '.*', status: 404, dest: '/404.html' },
  ];

  await writeFile(
    path.join(program.directory, 'public', REDIRECT_FILE_NAME),
    JSON.stringify(finalRoutes)
  );
};
