export function createGatsbyConfig(gatsbyConfigUser: boolean) {
  return `let userConfig = {}

${
  gatsbyConfigUser
    ? `try {
  userConfig = require('./gatsby-config-user.js')
} catch (err) {}`
    : ''
}

module.exports = {
  ...userConfig,
  plugins: [
    ...(userConfig.plugins || []),
    { resolve: require.resolve('gatsby-plugin-now') }
  ]
}`;
}
