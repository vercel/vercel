import { contentType } from 'mime-types';

export default function getMimeType(fileName: string) {
  return contentType(fileName) || 'application/octet-stream';
}
