let fallbackReason: string | undefined;

export function recordDirectBuildFallback(reason: string): void {
  fallbackReason = reason;
}

// Tags the fallback CLI's root span so build-container traces show why the
// native build worker did not run `vercel build` directly.
export function getDirectBuildFallbackAttributes():
  | Record<string, string>
  | undefined {
  return fallbackReason === undefined
    ? undefined
    : { directBuild: 'false', fallbackReason };
}
