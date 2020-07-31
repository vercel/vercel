module.exports = api => {
  api.cache(true);

  const presets = [require.resolve('next/babel')];

  return { presets, plugins: [] };
};
