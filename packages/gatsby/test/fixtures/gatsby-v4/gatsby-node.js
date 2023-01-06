const fs = require('fs');

exports.createPages = async ({ actions }) => {
  const { createPage } = actions;
  createPage({
    path: '/using-dsg',
    component: require.resolve('./src/templates/using-dsg.js'),
    context: {},
    defer: true,
  });
};

exports.onPostBuild = async ({ store }) => {
  console.log(store.getState().pages)
}
