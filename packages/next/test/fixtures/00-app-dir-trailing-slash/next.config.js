module.exports = {
  trailingSlash: true,
  experimental: {
    appDir: true,
  },
  rewrites: async () => {
    return [
      {
        source: '/rewritten-to-dashboard',
        destination: '/dashboard',
      },
    ];
  },
};
