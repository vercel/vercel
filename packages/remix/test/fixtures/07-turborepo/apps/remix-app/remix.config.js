const path = require("node:path");

const glob = require("glob");

const packages = glob
  .sync("packages/**/package.json", {
    cwd: path.join(__dirname, "..", ".."),
    ignore: ["**/node_modules/**"],
    absolute: true,
  })
  .map((pkg) => path.dirname(pkg));

/**
 * @type {import('@remix-run/dev').AppConfig}
 */
module.exports = {
  serverBuildTarget: "vercel",
  appDirectory: "app",
  ignoredRouteFiles: [".*"],
  assetsBuildDirectory: "public/build",
  // When running locally in development mode, we use the built in remix
  // server. This does not understand the vercel lambda module format,
  // so we default back to the standard build output.
  server: process.env.NODE_ENV === "development" ? undefined : "./server.js",
  serverDependenciesToBundle: [/.*/],
  watchPaths: packages,
};
