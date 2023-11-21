import { contentType } from 'mime-types';
import path from 'node:path';

export default function getMimeType(fileName: string) {
  const extension = path.extname(fileName);
  return contentType(extension) || 'application/octet-stream';
}
