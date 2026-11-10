export function fetchDistTags(
  name: string,
  options?: { timeout?: number }
): Promise<Record<string, string> | undefined>;
