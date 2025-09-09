import path from 'path';
import { FileFsRef, type Files } from '@vercel/build-utils';

// Mirror from Next.js: https://github.com/vercel/next.js/blob/4b66771895737170a06be242be1e5afc760142d4/packages/next/src/lib/metadata/is-metadata-route.ts#L54
const STATIC_METADATA_IMAGES = {
  icon: {
    filename: 'icon',
    extensions: ['ico', 'jpg', 'jpeg', 'png', 'svg'],
  },
  apple: {
    filename: 'apple-icon',
    extensions: ['jpg', 'jpeg', 'png'],
  },
  openGraph: {
    filename: 'opengraph-image',
    extensions: ['jpg', 'jpeg', 'png', 'gif'],
  },
  twitter: {
    filename: 'twitter-image',
    extensions: ['jpg', 'jpeg', 'png', 'gif'],
  },
};

// The -\w{6} is the suffix that normalized from group routes;
const groupSuffix = '(-\\w{6})?';
const suffixMatcher = '\\d?';

// The following regex patterns match static metadata files
// Pattern: <filename><number suffix><group suffix><extension>
const METADATA_STATIC_FILE_REGEX = [
  new RegExp(`^[\\\\/]robots\\.txt$`),
  new RegExp(`^[\\\\/]manifest\\.(webmanifest|json)$`),
  new RegExp(`[\\\\/]sitemap\\.xml$`),
  new RegExp(`^[\\\\/]favicon\\.ico$`),
  new RegExp(
    `[\\\\/]${STATIC_METADATA_IMAGES.icon.filename}${suffixMatcher}${groupSuffix}${`\\.(?:${STATIC_METADATA_IMAGES.icon.extensions.join('|')})`}$`
  ),
  new RegExp(
    `[\\\\/]${STATIC_METADATA_IMAGES.apple.filename}${suffixMatcher}${groupSuffix}${`\\.(?:${STATIC_METADATA_IMAGES.apple.extensions.join('|')})`}$`
  ),
  new RegExp(
    `[\\\\/]${STATIC_METADATA_IMAGES.openGraph.filename}${suffixMatcher}${groupSuffix}${`\\.(?:${STATIC_METADATA_IMAGES.openGraph.extensions.join('|')})`}$`
  ),
  new RegExp(
    `[\\\\/]${STATIC_METADATA_IMAGES.twitter.filename}${suffixMatcher}${groupSuffix}${`\\.(?:${STATIC_METADATA_IMAGES.twitter.extensions.join('|')})`}$`
  ),
];

export function isStaticMetadataRoute(pathname: string) {
  return METADATA_STATIC_FILE_REGEX.some(regex => regex.test(pathname));
}

/**
 * Check if a route is a static metadata route and has corresponding source file
 */
const CONTENT_TYPE_MAP: Record<string, string> = {
  ico: 'image/x-icon',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  xml: 'application/xml',
  json: 'application/manifest+json',
  webmanifest: 'application/manifest+json',
};

// Mirror from Next.js: https://github.com/vercel/next.js/blob/4b66771895737170a06be242be1e5afc760142d4/packages/next/src/shared/lib/hash.ts#L8
function djb2Hash(str: string) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) + hash + char) & 0xffffffff;
  }
  return hash >>> 0;
}

// Mirror from Next.js: https://github.com/vercel/next.js/blob/4b66771895737170a06be242be1e5afc760142d4/packages/next/src/lib/metadata/get-metadata-route.ts#L28
function getMetadataRouteSuffix(page: string) {
  // Remove the last segment and get the parent pathname
  // e.g. /parent/a/b/c -> /parent/a/b
  // e.g. /parent/opengraph-image -> /parent
  const parentPathname = path.dirname(page);
  // Only apply suffix to metadata routes except for sitemaps
  if (page.endsWith('/sitemap')) {
    return '';
  }

  // Calculate the hash suffix based on the parent path
  let suffix = '';
  // Check if there's any special characters in the parent pathname.
  const segments = parentPathname.split('/');
  if (
    segments.some(
      seg =>
        (seg.startsWith('(') && seg.endsWith(')')) ||
        (seg.startsWith('@') && seg !== '@children')
    )
  ) {
    // Hash the parent path to get a unique suffix
    suffix = djb2Hash(parentPathname).toString(36).slice(0, 6);
  }
  return suffix;
}

// Remove group segments and parallel segments, and attach the suffix to file basename
// e.g.: /(group)/foo/icon.svg -> /foo/icon-mxheo5.svg
function normalizeAppPath(route: string) {
  const normalized = route.split('/').reduce((pathname, segment) => {
    // Empty segments are ignored.
    if (!segment) {
      return pathname;
    }

    // Groups are ignored.
    if (segment.startsWith('(') && segment.endsWith(')')) {
      return pathname;
    }

    // Parallel segments are ignored.
    if (segment[0] === '@') {
      return pathname;
    }

    return `${pathname}/${segment}`;
  }, '');

  const { dir, name, ext } = path.parse(normalized);
  const suffix = getMetadataRouteSuffix(route);
  const pathname = path.posix.join(
    dir,
    `${name}${suffix ? `-${suffix}` : ''}${ext}`
  );
  return pathname;
}

export function getContentTypeFromFile(fileRef: FileFsRef): string | undefined {
  const ext = path.extname(fileRef.fsPath).slice(1);
  return CONTENT_TYPE_MAP[ext];
}

export function getSourceFileRefOfStaticMetadata(
  routeKey: string,
  appPathnameFilesMap: Map<string, FileFsRef>
): FileFsRef | undefined {
  const isMetadataPattern = isStaticMetadataRoute(routeKey);

  if (isMetadataPattern) {
    const hasStaticSourceFile = appPathnameFilesMap.has(routeKey);

    if (hasStaticSourceFile) {
      return appPathnameFilesMap.get(routeKey) as FileFsRef;
    }
  }
  return undefined;
}

// strip the suffix from routeKey, but preserve the extension
// e.g. /foo/icon-<suffix>.png -> /foo/icon.png
// A set of files in relative paths of source files.
// key is the pathname, value is the file ref.
// { /foo/icon.svg -> ... }
export function getAppRouterPathnameFilesMap(files: Files) {
  const appPathnameFilesMap = new Map<string, FileFsRef>();

  for (const [filePath, fileRef] of Object.entries(files)) {
    if (filePath.startsWith('app/') && 'fsPath' in fileRef) {
      const normalizedPath = normalizeAppPath(filePath.slice(3));
      appPathnameFilesMap.set(normalizedPath, fileRef);
    }
  }

  return appPathnameFilesMap;
}
