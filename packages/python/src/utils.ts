export function parseMajorMinor(v: string): [number, number] | null {
  const m = v.match(/^(\d+)\.(\d+)/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null;
}

export function compareMajorMinor(a: string, b: string): number {
  const pa = parseMajorMinor(a);
  const pb = parseMajorMinor(b);
  if (!pa || !pb) return 0;
  if (pa[0] !== pb[0]) return pa[0] - pb[0];
  return pa[1] - pb[1];
}
