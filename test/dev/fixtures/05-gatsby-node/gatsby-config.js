module.exports = {
  siteMetadata: {
    title: 'Gatsby + Node.js API'
  },
  plugins: [
    `gatsby-plugin-react-helmet`,
    {
      resolve: `gatsby-plugin-manifest`,
      options: {
        name: 'Gatsby + Node.js API',
        short_name: 'Gatbsy + Node.js',
        start_url: '/',
        icon: 'src/images/gatsby-icon.png'
      }
    }
  ]
};
