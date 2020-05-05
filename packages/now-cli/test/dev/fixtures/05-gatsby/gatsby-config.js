module.exports = {
  siteMetadata: {
    title: 'Gatsby Default Starter',
  },
  plugins: [
    {
      resolve: `gatsby-plugin-manifest`,
      options: {
        name: `05-gatsby`,
        short_name: `starter`,
        start_url: `/`,
        icon: 'src/images/gatsby-icon.png',
      },
    },
  ],
};
