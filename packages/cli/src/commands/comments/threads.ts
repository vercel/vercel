export interface ThreadRef {
  id: string;
  /**
   * Team slug parsed from a dashboard webUrl
   * (`https://vercel.com/{team}/{project}/c/{id}`). Unlike page URLs — where
   * rewrites make URL→project inference ambiguous and it is banned — the
   * dashboard URL is the thread's canonical address, so its team is
   * authoritative scope context.
   */
  teamSlug?: string;
}

/**
 * A `<thread>` argument is a full thread ID or the thread's `webUrl`. There
 * is no prefix matching and no input-shape validation: whatever the user
 * passes goes to the API, and an unknown ID surfaces as the API's 404.
 */
export function parseThreadArg(arg: string): ThreadRef | undefined {
  if (!/^https?:\/\//i.test(arg)) {
    return { id: arg };
  }

  let url: URL;
  try {
    url = new URL(arg);
  } catch {
    return undefined;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const cIndex = segments.lastIndexOf('c');
  if (cIndex !== -1 && cIndex + 1 < segments.length) {
    // decodeURIComponent throws URIError on malformed sequences (`/c/%`);
    // a bad URL is a validation failure, not a crash.
    const id = safeDecode(segments[cIndex + 1]);
    if (!id) {
      return undefined;
    }
    return {
      id,
      teamSlug: cIndex > 1 ? safeDecode(segments[0]) : undefined,
    };
  }

  return undefined;
}

function safeDecode(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment) || undefined;
  } catch {
    return undefined;
  }
}
