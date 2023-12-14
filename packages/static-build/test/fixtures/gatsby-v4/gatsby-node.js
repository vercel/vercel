const fs = require('fs');

exports.createPages = async ({ actions }) => {
  const { createPage, createRedirect } = actions;
        console.log('createPages');

    createRedirect({
        fromPath: `/blog`,
        toPath: `/using-ssr`,
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
