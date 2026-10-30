import { readdirSync } from 'node:fs';

export type Libc = 'glibc' | 'musl';

export function isLibc(value: unknown): value is Libc {
  return value === 'glibc' || value === 'musl';
}

function hasMuslLoader(): boolean {
  try {
    return readdirSync('/lib').some(
      name => name.startsWith('ld-musl-') && name.endsWith('.so.1')
    );
  } catch {
    return false;
  }
}

function detectLibcFromReport(): Libc | undefined {
  const report = process.report as
    | (NodeJS.ProcessReport & { excludeNetwork?: boolean })
    | undefined;
  if (!report || typeof report.getReport !== 'function') return;
  const originalExcludeNetwork = report.excludeNetwork;
  try {
    // Network interface enumeration dominates getReport() cost.
    report.excludeNetwork = true;
    const { header } = report.getReport() as {
      header?: { glibcVersionRuntime?: string };
    };
    return header?.glibcVersionRuntime ? 'glibc' : 'musl';
  } catch {
    return;
  } finally {
    report.excludeNetwork = originalExcludeNetwork;
  }
}

export function detectLibc(): Libc | undefined {
  if (process.platform !== 'linux') return;
  return detectLibcFromReport() ?? (hasMuslLoader() ? 'musl' : 'glibc');
}
