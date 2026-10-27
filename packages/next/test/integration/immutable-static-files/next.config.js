module.exports = {
  supportsImmutableAssets: true,
  ...(process.env.NEXT_TEST_OUTPUT_EXPORT === '1' && { output: 'export' }),
};
