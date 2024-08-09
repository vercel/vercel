export interface ProgressOptions {
  width?: number;
  complete?: string;
  incomplete?: string;
}

/**
 * Returns a raw progress bar string.
 */
export function progress(
  current: number,
  total: number,
  opts: ProgressOptions = {}
): string | null {
  const { width = 20, complete = '=', incomplete = '-' } = opts;
  if (total <= 0 || current < 0 || current > total) {
    // Let the caller decide how to handle out-of-range values
    return null;
  }
  const unit = total / width;
  const pos = Math.floor(current / unit);
  return `${complete.repeat(pos)}${incomplete.repeat(width - pos)}`;
}
