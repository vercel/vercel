import path from 'path';
import { FileFsRef, type File, type Files } from '@vercel/build-utils';

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

export function isStaticMetadataRoute(pathname: string) {
  // The -\w{6} is the suffix that normalized from group routes;
  const groupSuffix = '(-\\w{6})?';
  const suffixMatcher = '\\d?';

  const metadataRouteFilesRegex = [
    new RegExp(`^[\\\\/]robots\\.txt$`),
    new RegExp(`^[\\\\/]manifest\\.(webmanifest|json)$`),
    new RegExp(`[\\\\/]sitemap\\.xml$`),
    new RegExp(`^[\\\\/]favicon\\.ico$`),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.icon.filename}${suffixMatcher}${`\\.(?:${STATIC_METADATA_IMAGES.icon.extensions.join('|')})`}${groupSuffix}$`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.apple.filename}${suffixMatcher}${`\\.(?:${STATIC_METADATA_IMAGES.apple.extensions.join('|')})`}${groupSuffix}$`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.openGraph.filename}${suffixMatcher}${`\\.(?:${STATIC_METADATA_IMAGES.openGraph.extensions.join('|')})`}${groupSuffix}$`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.twitter.filename}${suffixMatcher}${`\\.(?:${STATIC_METADATA_IMAGES.twitter.extensions.join('|')})`}${groupSuffix}$`
    ),
  ];

  return metadataRouteFilesRegex.some(regex => regex.test(pathname));
}

/**
 * Check if a route pattern matches a given pathname
 * e.g. /blog/[id]/icon.png matches /blog/1/icon.png
 */
function matchesRoute(pattern: string, pathname: string): boolean {
  // Convert pattern like /blog/[id]/icon.png to regex
  const regexPattern = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex characters first
    .replace(/\\\[([^\]]+)\\\]/g, '([^/]+)'); // Replace escaped [param] with capture groups

  const regex = new RegExp(`^${regexPattern}$`);
  const result = regex.test(pathname);

  return result;
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

export function getContentTypeFromFile(fileRef: File): string | undefined {
  if (!fileRef || !('fsPath' in fileRef)) {
    return undefined;
  }

  const ext = path.extname(fileRef.fsPath).slice(1);
  return CONTENT_TYPE_MAP[ext];
}

export function getSourceFileRefOfStaticMetadata(
  routeKey: string,
  files: Files
): FileFsRef | undefined {
  const isMetadataPattern = isStaticMetadataRoute(routeKey);

  if (isMetadataPattern) {
    // strip the suffix from routeKey
    const normalizedPathname = routeKey.replace(/-\w{6}$/, '');

    // A set of files in relative paths of source files
    // app/page.tsx app/icon.svg
    const filesSet = new Set(Object.keys(files));
    const targetPath = `app${normalizedPathname}`;
    const hasStaticSourceFile = filesSet.has(targetPath);

    if (hasStaticSourceFile) {
      return files[targetPath] as FileFsRef;
    }

    // Check for dynamic route matches
    // e.g. /blog/1/icon.png should match /blog/[id]/icon.png
    for (const filePath of filesSet) {
      if (filePath.startsWith('app/')) {
        const pattern = filePath.slice(3);
        const matches = matchesRoute(pattern, normalizedPathname);
        if (matches) {
          return files[filePath] as FileFsRef;
        }
      }
    }

    return undefined;
  }

  return undefined;
}
