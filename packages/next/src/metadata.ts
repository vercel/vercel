import path from 'path';
import { type File, type Files } from '@vercel/build-utils';

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

  const matched = metadataRouteFilesRegex.some(r => r.test(pathname));

  return matched;
}

/**
 * Check if a route pattern matches a given pathname
 * e.g. /blog/[id]/icon.png matches /blog/1/icon.png
 * e.g. /blog/[...slug]/icon.png matches /blog/a/b/c/icon.png
 * e.g. /blog/[[...slug]]/icon.png matches /blog/icon.png and /blog/a/b/icon.png
 */
function matchesRoute(pattern: string, pathname: string): boolean {
  // Simple pattern matching for Next.js dynamic routes
  let regexPattern = pattern;

  // Handle optional catch-all routes [[...param]] - matches zero or more path segments
  // This needs to handle the case where there are zero segments, so we make the whole segment optional
  regexPattern = regexPattern.replace(/\/\[\[\.\.\..*?\]\]/g, '(?:/.*)?');

  // Handle catch-all routes [...param] - matches one or more path segments
  regexPattern = regexPattern.replace(/\[\.\.\..*?\]/g, '.+');

  // Handle regular dynamic routes [param] - matches one path segment
  regexPattern = regexPattern.replace(/\[.*?\]/g, '[^/]+');

  // Escape literal dots in file extensions only (not the wildcards we just added)
  regexPattern = regexPattern.replace(/(\w)\./g, '$1\\.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(pathname);
}

/**
 * Check if a route is a static metadata route and has corresponding source file
 */
export function getContentTypeFromFile(fileRef: File): string | undefined {
  if (!fileRef || !('fsPath' in fileRef)) {
    return undefined;
  }

  const ext = path.extname(fileRef.fsPath).slice(1);
  switch (ext) {
    case 'ico':
      return 'image/x-icon';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'txt':
      return 'text/plain';
    case 'xml':
      return 'application/xml';
    case 'json':
    case 'webmanifest':
      return 'application/manifest+json';
    default:
      break;
  }
  return undefined;
}

export function isSourceFileStaticMetadata(
  route: string,
  files: Files
): boolean {
  const pathname = route.replace(/\/route$/, '');
  const isMetadataPattern = isStaticMetadataRoute(pathname);

  if (isMetadataPattern) {
    // strip the suffix from pathname
    const normalizedPathname = pathname.replace(/-\w{6}$/, '');
    // A set of files in relative paths of source files
    // app/page.tsx app/icon.svg
    const filesSet = new Set(Object.keys(files));
    const targetPath = `app${normalizedPathname}`;
    const hasStaticSourceFile = filesSet.has(targetPath);

    if (hasStaticSourceFile) {
      return true;
    }

    // Check for dynamic route matches
    // e.g. /blog/1/icon.png should match /blog/[id]/icon.png
    for (const filePath of filesSet) {
      if (
        filePath.startsWith('app/') &&
        matchesRoute(`${filePath.slice(3)}`, normalizedPathname)
      ) {
        return true;
      }
    }

    return false;
  }

  return false;
}
