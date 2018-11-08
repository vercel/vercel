module.exports = function parseMeta(meta) {
  if (!meta) {
    return {};
  }

  if (typeof meta === 'string') {
    meta = [meta];
  }

  const parsed = {};

  meta.forEach(item => {
    const [key, value] = item.split('=');
    parsed[key] = value || '';
  });

  return parsed;
};
