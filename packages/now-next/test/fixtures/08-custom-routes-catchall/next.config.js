module.exports = {
  generateBuildId() {
    return 'build-id'
  },
  experimental: {
    async rewrites() {
      return [
        {
          source: '/:path*',
          destination: '/params'
        }
      ]
    }
  }
}
