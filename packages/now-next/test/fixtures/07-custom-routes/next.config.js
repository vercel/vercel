module.exports = {
  experimental: {
    async redirects() {
      return [
        {
          source: '/redir1',
          destination: '/redir2',
          permanent: true,
        },
        {
          source: '/redir2',
          destination: '/hello',
          permanent: false,
        },
        {
          source: '/redir/:path',
          destination: '/:path',
          permanent: false,
        },
      ];
    },
    async rewrites() {
      return [
        {
          source: '/rewrite1',
          destination: '/rewrite2',
        },
        {
          source: '/rewrite2',
          destination: '/hello',
        },
        {
          source: '/rewrite/:first/:second',
          destination: '/rewrite-2/hello/:second',
        },
        {
          source: '/rewrite-2/:first/:second',
          destination: '/params',
        },
      ];
    },
  },
};
