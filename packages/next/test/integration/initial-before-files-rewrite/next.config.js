module.exports = () => ({
  rewrites() {
    return {
      beforeFiles: [
        {
          source: '/hello',
          destination: '/somewhere',
          has: [
            {
              type: 'header',
              key: 'something',
              value: 'another',
            },
          ],
        },
      ],
    };
  },
});
