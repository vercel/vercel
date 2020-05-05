export default function parseMeta(meta) {
  if (!meta) {
    return {};
  }

  if (typeof meta === 'string') {
    meta = [meta];
  }

  const parsed = {};

  meta.forEach(item => {
    const [key, ...rest] = item.split('=');
    parsed[key] = rest.join('=');
  });

  return parsed;
}
