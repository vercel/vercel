/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    ppr: 'incremental',
    dynamicIO: true,
    clientSegmentCache: true,
  },
};
