module.exports = {
  experimental: {
    appDir: true,
    runtime: 'nodejs',
    ppr: true,
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
