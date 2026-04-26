export function isBunCompiledBinary(): boolean {
  try {
    // POSIX virtual FS: /$bunfs/...   Windows virtual FS: B:/~BUN/...
    const url = import.meta.url;
    return url.includes('/$bunfs/') || url.includes('B:/~BUN/');
  } catch {
    return false;
  }
}
