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
    ];
  },
};
