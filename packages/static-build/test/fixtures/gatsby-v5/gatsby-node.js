exports.createPages = async ({ actions }) => {
  const { createRedirect } = actions;

  createRedirect({
    fromPath: `/redirect/`,
    toPath: `/ssr`,
  });

  // This is a "rewrite"
  createRedirect({
    fromPath: `/rewrite/`,
    toPath: `https://vercel.com/`,
    statusCode: 200,
  });
};
