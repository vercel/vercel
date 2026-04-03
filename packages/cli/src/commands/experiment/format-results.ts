/**
 * Best-effort extraction of labelled numeric rows for ASCII bar output.
 * The API payload may evolve; unknown shapes fall back to JSON only.
 */
export function extractBarChartRows(
  data: unknown
): { label: string; value: number }[] | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const root = data as Record<string, unknown>;

  const candidates: unknown[] = [];
  if (Array.isArray(root.variants)) {
    candidates.push(...root.variants);
  }
  if (Array.isArray(root.results)) {
    candidates.push(...root.results);
  }
  if (Array.isArray(root.series)) {
    candidates.push(...root.series);
  }

  if (candidates.length === 0) {
    return null;
  }

  const rows: { label: string; value: number }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Record<string, unknown>;
    const label = String(
      row.name ??
        row.slug ??
        row.label ??
        row.variant ??
        row.id ??
        `series-${i}`
    );
    const raw =
      row.conversionRate ??
      row.rate ??
      row.value ??
      row.mean ??
      row.count ??
      row.conversions;
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value)) {
      continue;
    }
    rows.push({ label, value });
  }

  return rows.length ? rows : null;
}

export function renderAsciiBars(
  rows: { label: string; value: number }[],
  barWidth = 24
): string {
  const max = Math.max(...rows.map(r => Math.abs(r.value)), 1);
  const lines: string[] = [];
  for (const r of rows) {
    const mag = Math.abs(r.value);
    const filled = Math.round((mag / max) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    lines.push(`${r.label.padEnd(28)} ${bar} ${r.value}`);
  }
  return lines.join('\n');
}
