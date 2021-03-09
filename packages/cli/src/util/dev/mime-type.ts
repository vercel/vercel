import { lookup as lookupMimeType } from 'mime-types';

export default function getMimeType(fileName: string) {
  return lookupMimeType(fileName) || 'application/octet-stream';
}
