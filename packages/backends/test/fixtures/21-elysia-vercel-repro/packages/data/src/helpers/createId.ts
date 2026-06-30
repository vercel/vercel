// Minimal id generator. The original used @paralleldrive/cuid2; inlined here
// to keep the repro's dependency surface small.
export const createId = (): string =>
  Math.random().toString(36).slice(2, 14).padEnd(12, '0');
