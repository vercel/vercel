const fs = require('fs');

exports.createPages = async ({ actions }) => {
  const { createPage, createRedirect } = actions;

  createRedirect({
    fromPath: `/redirect`,
    toPath: `/using-ssr`,
  });

  // This is a "rewrite"
  createRedirect({
    fromPath: `/rewrite`,
    toPath: `https://vercel.com/`,
    statusCode: 200,
  });

  createPage({
    path: '/using-dsg',
    component: require.resolve('./src/templates/using-dsg.js'),
    context: {},
    defer: true,
  });
};

exports.onPostBuild = async () => {
  await fs.promises.copyFile('asset.txt', 'public/asset.txt');
};
