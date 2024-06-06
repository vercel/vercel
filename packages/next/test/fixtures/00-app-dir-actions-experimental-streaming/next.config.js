module.exports = {
  rewrites() {
    return [
      {
        source: '/rewrite/rsc/static',
        destination: '/rsc/static',
      },
      {
        source: '/rewrite/edge/rsc/static',
        destination: '/edge/rsc/static',
      },
      {
        source: '/greedy-rewrite/static/:path*',
        destination: '/static/:path*',
      },
      {
        source: '/greedy-rewrite/edge/static/:path*',
        destination: '/edge/static/:path*',
      },
      {
        source: '/rewritten-to-index',
        destination: '/?fromRewrite=1',
      },
    ];
  },
};
