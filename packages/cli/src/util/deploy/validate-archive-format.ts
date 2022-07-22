import { ArchiveFormat } from '@vercel/client';

export function archiveFormats(): string[] {
  return Object.values(ArchiveFormat);
}

export function isValidArchive(archive: string): archive is ArchiveFormat {
  return archiveFormats().includes(archive);
}
