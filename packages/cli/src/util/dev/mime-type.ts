import { contentType } from 'mime-types';

export default function getMimeType(fileName: string) {
  const extension = /[^.]+$/.exec(filename);
  return contentType(extension) || 'application/octet-stream';
}
