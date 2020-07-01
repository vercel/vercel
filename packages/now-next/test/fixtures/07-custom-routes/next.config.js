module.exports = {
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
      {
        source: '/add-header',
        destination: '/hello',
      },
      {
        source: '/catchall-header/:path*',
        destination: '/hello',
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/add-header',
        headers: [
          {
            key: 'x-hello',
            value: 'world',
          },
          {
            key: 'x-another',
            value: 'value',
          },
        ],
      },
      {
        source: '/catchall-header/:path*',
        headers: [
          {
            key: 'x-hello',
            value: 'world',
          },
          {
            key: 'x-another',
            value: 'value',
          },
        ],
      },
    ];
  },
};
