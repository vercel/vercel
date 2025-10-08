/** @type {import('next').NextConfig} */
module.exports = {
  rewrites: async () => {
    return [
      {
        source: '/hello/sam',
        destination: '/hello/samantha',
      },
      {
        source: '/hello/fred',
        destination: '/other?key=value',
      },
      {
        source: '/hello/(.*)/google',
        destination: 'https://www.google.$1/',
      },
      {
        source: '/hello/suffix/:suffix',
        destination: '/:suffix?suffix=:suffix#hash',
      },
      {
        source: '/hello/missing',
        destination: '/other',
        missing: [{ type: 'header', key: 'RSC' }],
      },
      {
        source: '/hello/has',
        destination: '/other',
        has: [
          {
            type: 'header',
            key: 'x-other-header',
            value: 'other-value',
          },
        ],
      },
    ];
  },
};
