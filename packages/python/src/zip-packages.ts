import fs from 'fs';
import { join, extname } from 'path';
import { ZipFile } from 'yazl';
import { debug } from '@vercel/build-utils';

export const VENDOR_PY_ZIP = '_vendor-py.zip';
export const VENDOR_PY_DIR = '_vendor-py';
export const VENDOR_NATIVE_ZIP = '_vendor-native.zip';
const ALLOWED_SOURCE_EXTENSIONS = new Set(['.py', '.pyi']);
const NON_ZIP_SAFE_EXTENSIONS = new Set([
  '.so',
  '.pyd',
  '.dll',
  '.dylib',
  '.a',
  '.o',
  '.exe',
  '.bin',
  // Certificates/keys: often require real file paths (e.g. certifi)
  '.pem',
  '.crt',
  '.cer',
  '.der',
  '.key',
  // Packaged data often opened from filesystem
  '.pkl',
  '.pickle',
  '.dat',
]);

// Add a file or directory tree to `zip`, preserving paths relative to `rootDir`.
// Returns true if all files under `relativePath` were queued successfully; otherwise false.
async function zipAddTree(
  zip: ZipFile,
  rootDir: string,
  relativePath: string
): Promise<boolean> {
  const absolutePath = join(rootDir, relativePath);
  let stat: fs.Stats;
  try {
    stat = await fs.promises.lstat(absolutePath);
  } catch (err: any) {
    debug(
      `Failed to stat during zipping: ${relativePath} (${err?.message || 'unknown error'})`
    );
    return false;
  }

  if (
    typeof (stat as any).isSymbolicLink === 'function' &&
    stat.isSymbolicLink()
  ) {
    debug(`Skipping symlink during zipping: ${relativePath}`);
    return false;
  }

  if (stat.isDirectory()) {
    let children: fs.Dirent[];
    try {
      children = await fs.promises.readdir(absolutePath, {
        withFileTypes: true,
      });
    } catch (err: any) {
      debug(
        `Failed to read directory during zipping: ${relativePath} (${err?.message || 'unknown error'})`
      );
      return false;
    }
    for (const child of children) {
      if (child.name === '__pycache__') continue;
      const ok = await zipAddTree(zip, rootDir, join(relativePath, child.name));
      if (!ok) return false;
    }
    return true;
  }

  if (stat.isFile()) {
    try {
      zip.addFile(absolutePath, relativePath, { compress: true });
    } catch (err: any) {
      debug(
        `Failed to queue file for zipping: ${relativePath} (${err?.message || 'unknown error'})`
      );
      return false;
    }
    return true;
  }

  debug(`Skipping non-file non-directory during zipping: ${relativePath}`);
  return false;
}

// Returns true if the directory tree contains at least one Python source file
async function dirHasPythonSourceInTree(dirAbsPath: string): Promise<boolean> {
  const entries = await fs.promises.readdir(dirAbsPath, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (entry.name === '__pycache__') continue;
    const abs = join(dirAbsPath, entry.name);
    if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (ALLOWED_SOURCE_EXTENSIONS.has(ext)) return true;
    } else if (entry.isDirectory()) {
      if (await dirHasPythonSourceInTree(abs)) return true;
    }
  }
  return false;
}

// Returns true if the directory tree contains at least one compiled/binary file
async function dirHasBinaryInTree(dirAbsPath: string): Promise<boolean> {
  const entries = await fs.promises.readdir(dirAbsPath, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (entry.name === '__pycache__') continue;
    const abs = join(dirAbsPath, entry.name);
    if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (NON_ZIP_SAFE_EXTENSIONS.has(ext)) return true;
    } else if (entry.isDirectory()) {
      if (await dirHasBinaryInTree(abs)) return true;
    }
  }
  return false;
}

async function collectPurePythonTopLevelCandidates(
  vendorAbs: string
): Promise<string[]> {
  // Discover top-level pure-Python candidates inside vendorDirAbsolutePath
  let entries: fs.Dirent[] = [];
  try {
    entries = await fs.promises.readdir(vendorAbs, { withFileTypes: true });
  } catch (err) {
    debug('Failed to read vendor directory for zipping');
    return [];
  }

  const candidates: string[] = [];
  for (const entry of entries) {
    const name = entry.name;
    // Ignore non-pure-Python top-level files/directories
    if (
      name === VENDOR_PY_ZIP ||
      name === VENDOR_PY_DIR ||
      name === VENDOR_NATIVE_ZIP ||
      name === '__pycache__' ||
      name.endsWith('.dist-info') ||
      name.endsWith('.data') ||
      name.endsWith('.egg-info') ||
      name.endsWith('.pth')
    ) {
      continue;
    }
    const relEntryPath = name;
    const absEntryPath = join(vendorAbs, relEntryPath);
    if (entry.isDirectory()) {
      // Include package directories that contain Python source, but exclude those with binary artifacts
      const hasPy = await dirHasPythonSourceInTree(absEntryPath);
      const hasBin = await dirHasBinaryInTree(absEntryPath);
      if (hasPy && !hasBin) {
        candidates.push(relEntryPath);
      }
    } else if (entry.isFile()) {
      const ext = extname(name).toLowerCase();
      if (ALLOWED_SOURCE_EXTENSIONS.has(ext)) {
        candidates.push(relEntryPath);
      }
    }
  }

  return candidates;
}

async function collectNativeTopLevelCandidates(
  vendorAbs: string
): Promise<string[]> {
  let entries: fs.Dirent[] = [];
  try {
    entries = await fs.promises.readdir(vendorAbs, { withFileTypes: true });
  } catch (err) {
    debug('Failed to read vendor directory for zipping (native)');
    return [];
  }

  const candidatesSet = new Set<string>();
  for (const entry of entries) {
    const name = entry.name;
    if (
      name === VENDOR_PY_ZIP ||
      name === VENDOR_PY_DIR ||
      name === VENDOR_NATIVE_ZIP ||
      name === '__pycache__'
    ) {
      continue;
    }
    const relEntryPath = name;
    const absEntryPath = join(vendorAbs, relEntryPath);
    if (entry.isDirectory()) {
      // Include any directory that contains binary artifacts
      try {
        if (await dirHasBinaryInTree(absEntryPath)) {
          candidatesSet.add(relEntryPath);
        }
      } catch (err: any) {
        debug(
          `Failed to scan directory for native binaries during zipping: ${relEntryPath} (${err?.message || 'unknown error'})`
        );
      }
      // Include metadata and native-support directories
      if (
        name.endsWith('.dist-info') ||
        name.endsWith('.data') ||
        name.endsWith('.libs')
      ) {
        candidatesSet.add(relEntryPath);
      }
    } else if (entry.isFile()) {
      const ext = extname(name).toLowerCase();
      if (NON_ZIP_SAFE_EXTENSIONS.has(ext) || name.endsWith('.pth')) {
        candidatesSet.add(relEntryPath);
      }
    }
  }

  // Also include any top-level "<pkg>.libs" directories that might have been missed (already handled above)
  return Array.from(candidatesSet);
}

export async function zipPurePythonPackages(vendorDirAbsolutePath: string) {
  const candidates = await collectPurePythonTopLevelCandidates(
    vendorDirAbsolutePath
  );

  if (candidates.length === 0) {
    debug('No vendor packages found to zip');
    return;
  }

  const zipPath = join(vendorDirAbsolutePath, VENDOR_PY_ZIP);
  const zipTempPath = `${zipPath}.tmp`;
  try {
    await fs.promises.unlink(zipTempPath);
  } catch (err: any) {
    if (err && err.code !== 'ENOENT') throw err;
  }
  try {
    await fs.promises.unlink(zipPath);
  } catch (err: any) {
    if (err && err.code !== 'ENOENT') throw err;
  }

  debug(`Creating vendor package zip with ${candidates.length} entries...`);

  // First pass: zip all candidates to temp file
  const writeZip = async (entries: string[], destPath: string) => {
    const zip = new ZipFile();
    const out = fs.createWriteStream(destPath);
    const done = new Promise<void>((resolve, reject) => {
      let settled = false;
      const settleOnce = (fn: (arg?: any) => void) => (arg?: any) => {
        if (settled) return;
        settled = true;
        fn(arg);
      };
      out.on('close', settleOnce(resolve));
      out.on('error', settleOnce(reject));
      zip.outputStream.on('error', settleOnce(reject));
    });
    zip.outputStream.pipe(out);
    for (const relativeEntryPath of entries) {
      await zipAddTree(zip, vendorDirAbsolutePath, relativeEntryPath);
    }
    zip.end();
    await done;
  };

  try {
    await writeZip(candidates, zipTempPath);
  } catch (err: any) {
    debug(
      `Failed to create vendor pure-Python zip: ${err?.message || 'unknown error'}`
    );
    try {
      await fs.promises.unlink(zipTempPath);
    } catch (unlinkErr: any) {
      if (unlinkErr && unlinkErr.code !== 'ENOENT') {
        debug('Failed to remove temp vendor zip after write failure');
      }
    }
    return;
  }

  // Atomically move temp zip into final path first. If this fails, keep originals.
  try {
    await fs.promises.rename(zipTempPath, zipPath);
  } catch (err) {
    debug(
      'Failed to finalize vendor pure-Python zip; keeping originals in place'
    );
    try {
      await fs.promises.unlink(zipTempPath);
    } catch (unlinkErr) {
      debug('Failed to remove temp vendor zip after failed rename');
    }
    return;
  }

  for (const relativeEntryPath of candidates) {
    const abs = join(vendorDirAbsolutePath, relativeEntryPath);
    await fs.promises.rm(abs, { recursive: true, force: true });
  }

  debug(`Created ${VENDOR_PY_ZIP}`);
}

export async function zipNativePackages(vendorDirAbsolutePath: string) {
  const candidates = await collectNativeTopLevelCandidates(
    vendorDirAbsolutePath
  );

  if (candidates.length === 0) {
    debug('No native vendor packages found to zip');
    return;
  }

  const zipPath = join(vendorDirAbsolutePath, VENDOR_NATIVE_ZIP);
  const zipTempPath = `${zipPath}.tmp`;
  try {
    await fs.promises.unlink(zipTempPath);
  } catch (err: any) {
    if (err && err.code !== 'ENOENT') throw err;
  }
  try {
    await fs.promises.unlink(zipPath);
  } catch (err: any) {
    if (err && err.code !== 'ENOENT') throw err;
  }

  debug(
    `Creating native vendor package zip with ${candidates.length} entries...`
  );

  const writeZip = async (entries: string[], destPath: string) => {
    const zip = new ZipFile();
    const out = fs.createWriteStream(destPath);
    const done = new Promise<void>((resolve, reject) => {
      let settled = false;
      const settleOnce = (fn: (arg?: any) => void) => (arg?: any) => {
        if (settled) return;
        settled = true;
        fn(arg);
      };
      out.on('close', settleOnce(resolve));
      out.on('error', settleOnce(reject));
      zip.outputStream.on('error', settleOnce(reject));
    });
    zip.outputStream.pipe(out);
    for (const relativeEntryPath of entries) {
      await zipAddTree(zip, vendorDirAbsolutePath, relativeEntryPath);
    }
    zip.end();
    await done;
  };

  try {
    await writeZip(candidates, zipTempPath);
  } catch (err: any) {
    debug(
      `Failed to create vendor native zip: ${err?.message || 'unknown error'}`
    );
    try {
      await fs.promises.unlink(zipTempPath);
    } catch (unlinkErr: any) {
      if (unlinkErr && unlinkErr.code !== 'ENOENT') {
        debug('Failed to remove temp vendor native zip after write failure');
      }
    }
    return;
  }

  try {
    await fs.promises.rename(zipTempPath, zipPath);
  } catch (err) {
    debug('Failed to finalize vendor native zip; keeping originals in place');
    try {
      await fs.promises.unlink(zipTempPath);
    } catch (unlinkErr) {
      debug('Failed to remove temp vendor native zip after failed rename');
    }
    return;
  }

  for (const relativeEntryPath of candidates) {
    const abs = join(vendorDirAbsolutePath, relativeEntryPath);
    await fs.promises.rm(abs, { recursive: true, force: true });
  }

  debug(`Created ${VENDOR_NATIVE_ZIP}`);
}
