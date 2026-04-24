export function isBunCompiledBinary(): boolean {
  try {
    return import.meta.url.includes('/$bunfs/');
  } catch {
    return false;
  }
}
