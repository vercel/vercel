/**
 * @type {import('gatsby').GatsbyConfig}
 */
module.exports = {
  siteMetadata: {
    title: `gatsby-v5`,
    siteUrl: `https://www.yourdomain.tld`,
  },
  plugins: [`@vercel/gatsby-plugin-vercel-builder`],
  pathPrefix: '/foo',
};
