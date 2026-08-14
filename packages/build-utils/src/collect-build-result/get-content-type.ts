import { extname } from 'path';
import mimeTypes from 'mime-types';

export function getContentType(path: string): string {
  // Compat with legacy. We considered that `.html` should be considered a html file
  if (path.endsWith('.html')) {
    return 'text/html; charset=utf-8';
  }

  return mimeTypes.contentType(extname(path)) || 'application/octet-stream';
}
