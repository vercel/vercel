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
