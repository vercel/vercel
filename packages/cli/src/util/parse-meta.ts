export default function parseMeta(meta?: string | string[]) {
  if (!meta) {
    return {};
  }

  if (typeof meta === 'string') {
    meta = [meta];
  }

  const parsed: { [k: string]: string } = {};

  for (const item of meta) {
    const [key, ...rest] = item.split('=');
    parsed[key] = rest.join('=');
  }

  return parsed;
}
