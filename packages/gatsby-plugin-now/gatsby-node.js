const path = require("path");
const writeFile = require("util").promisify(require("fs").writeFile);

const REDIRECT_FILE_NAME = "__now_routes.json";

exports.onPostBuild = async ({ store }) => {
  const { redirects, program } = store.getState();

  if (!redirects.length === 0) {
    return;
  }

  const routes = redirects.map(redirect => {
    return {
      src: redirect.fromPath,
      status: redirect.statusCode || (redirect.isPermanent ? 301 : 302),
      headers: { Location: redirect.toPath }
    };
  });

  await writeFile(
    path.join(program.directory, "public", REDIRECT_FILE_NAME),
    JSON.stringify(routes)
  );
};
