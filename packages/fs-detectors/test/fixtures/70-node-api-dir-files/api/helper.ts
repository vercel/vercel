export function formatDate(d: Date): string {
  return d.toISOString();
}

export function sanitizeInput(input: string): string {
  return input.trim().toLowerCase();
}
