import fs from 'fs';
import { join, extname } from 'path';
import execa from 'execa';
import { debug, type Meta } from '@vercel/build-utils';

const NATIVE_EXTENSIONS = new Set(['.so', '.pyd', '.dll', '.dylib']);

function isLikelyNativeLibraryFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  const ext = extname(lower);
  if (NATIVE_EXTENSIONS.has(ext)) return true;
  // Handle versioned/unconventional names like libfoo.so.1.2.3
  if (lower.includes('.so') || lower.endsWith('.dylib')) return true;
  return false;
}

async function findLikelyNativeLibraryFiles(
  rootDir: string
): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string) {
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
      debug(
        `Failed to read directory during strip scan: ${dir} (${err?.message || 'unknown error'})`
      );
      return;
    }
    for (const entry of entries) {
      if (entry.name === '__pycache__') continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile()) {
        if (isLikelyNativeLibraryFile(entry.name)) {
          results.push(abs);
        }
      }
    }
  }
  await walk(rootDir);
  return results;
}

type Stripper = {
  cmd: string;
  buildArgs: (fileAbsPath: string) => string[];
};

function getStripperCandidates(platform: NodeJS.Platform): Stripper[] {
  if (platform === 'darwin') {
    return [
      { cmd: 'strip', buildArgs: f => ['-S', f] },
      { cmd: 'llvm-strip', buildArgs: f => ['-g', f] },
    ];
  }
  if (platform === 'win32') {
    return [
      { cmd: 'llvm-strip', buildArgs: f => ['-g', f] },
      { cmd: 'strip', buildArgs: f => ['--strip-debug', f] },
    ];
  }
  // linux and others
  return [
    { cmd: 'strip', buildArgs: f => ['--strip-debug', f] },
    { cmd: 'llvm-strip', buildArgs: f => ['-g', f] },
  ];
}

async function isCommandAvailable(cmd: string): Promise<boolean> {
  try {
    // Try a common version flag; some tools may exit non-zero but that's ok
    await execa(cmd, ['--version']);
    return true;
  } catch (err: any) {
    if (err && err.code === 'ENOENT') return false;
    // Non-ENOENT implies the command exists but didn't like the flag
    return true;
  }
}

async function resolveStripper(): Promise<Stripper | null> {
  const candidates = getStripperCandidates(process.platform);
  for (const c of candidates) {
    if (await isCommandAvailable(c.cmd)) return c;
  }
  return null;
}

type BinaryFormat = 'ELF' | 'MACHO' | 'PE' | 'UNKNOWN';

async function detectBinaryFormat(fileAbsPath: string): Promise<BinaryFormat> {
  let fd: fs.promises.FileHandle | null = null;
  try {
    fd = await fs.promises.open(fileAbsPath, 'r');
    const header = Buffer.alloc(64);
    await fd.read(header, 0, header.length, 0);
    // ELF: 0x7F 'E' 'L' 'F'
    if (
      header.length >= 4 &&
      header[0] === 0x7f &&
      header[1] === 0x45 &&
      header[2] === 0x4c &&
      header[3] === 0x46
    ) {
      return 'ELF';
    }
    // Mach-O magic constants (both endian, 32/64), plus FAT (universal) binaries
    const magic = header.readUInt32BE(0);
    const magicLE = header.readUInt32LE(0);
    const MACHO_MAGICS = new Set([
      0xfeedface, // 32-bit BE
      0xfeedfacf, // 64-bit BE
      0xcefaedfe, // 32-bit LE
      0xcffaedfe, // 64-bit LE
      0xcafebabe, // FAT
      0xcafebabf, // FAT 64
    ]);
    if (MACHO_MAGICS.has(magic) || MACHO_MAGICS.has(magicLE)) {
      return 'MACHO';
    }
    // PE/COFF: DOS header 'MZ' and PE signature at e_lfanew
    if (header[0] === 0x4d && header[1] === 0x5a) {
      const dosHeader = Buffer.alloc(64);
      header.copy(dosHeader, 0, 0, Math.min(64, header.length));
      const e_lfanew = dosHeader.readUInt32LE(0x3c);
      const peSig = Buffer.alloc(4);
      await fd.read(peSig, 0, 4, e_lfanew);
      if (
        peSig[0] === 0x50 &&
        peSig[1] === 0x45 &&
        peSig[2] === 0x00 &&
        peSig[3] === 0x00
      ) {
        return 'PE';
      }
    }
    return 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  } finally {
    try {
      await fd?.close();
    } catch (err: any) {
      debug(
        `Failed to close file during strip scan: ${fileAbsPath} (${err?.message || 'unknown error'})`
      );
    }
  }
}

async function isCodesignedMachO(fileAbsPath: string): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  if (!(await isCommandAvailable('codesign'))) return false;
  try {
    await execa('codesign', ['-dv', fileAbsPath]);
    return true;
  } catch {
    return false;
  }
}

export async function stripVendorBinaries(
  vendorDirAbsolutePath: string,
  meta: Meta
) {
  if (meta.isDev) {
    debug('Skipping stripping vendor binaries in dev mode');
    return;
  }

  if (process.platform === 'win32') {
    debug('Skipping stripping vendor binaries on Windows for safety');
    return;
  }

  const files = await findLikelyNativeLibraryFiles(vendorDirAbsolutePath);
  if (files.length === 0) {
    debug('No native binaries found in vendor directory to strip');
    return;
  }

  const stripper = await resolveStripper();
  if (!stripper) {
    debug('No strip tool available on PATH; skipping debug symbol stripping');
    return;
  }

  debug(`Stripping debug symbols from ${files.length} native binaries...`);

  for (const fileAbs of files) {
    try {
      const format = await detectBinaryFormat(fileAbs);
      if (process.platform === 'linux' && format !== 'ELF') {
        continue;
      }
      if (process.platform === 'darwin' && format !== 'MACHO') {
        continue;
      }

      if (process.platform === 'darwin' && (await isCodesignedMachO(fileAbs))) {
        debug(`Skipping signed Mach-O binary: ${fileAbs}`);
        continue;
      }

      await execa(stripper.cmd, stripper.buildArgs(fileAbs));
    } catch (err: any) {
      // Do not fail build if stripping fails for a file; continue best-effort
      debug(
        `Failed to strip debug symbols: ${fileAbs} (${err?.shortMessage || err?.message || 'unknown error'})`
      );
    }
  }
}
