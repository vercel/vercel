import {
  type ArchiveFormat,
  VALID_ARCHIVE_FORMATS,
} from '@vercel/client/dist/types';

const validArchiveFormats = new Set<string>(VALID_ARCHIVE_FORMATS);

export function isValidArchive(archive: string): archive is ArchiveFormat {
  return validArchiveFormats.has(archive);
}
