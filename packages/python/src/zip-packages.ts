import fs from 'fs';
import { join, extname } from 'path';
import { ZipFile } from 'yazl';
import { debug } from '@vercel/build-utils';

export const VENDOR_PY_ZIP = '_vendor-py.zip';
export const VENDOR_PY_DIR = '_vendor-py';
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
  // i18n compiled catalogs commonly used by Django
  '.mo',
  // Packaged data often opened from filesystem
  '.pkl',
  '.pickle',
  '.dat',
]);

// Add a file or directory tree to `zip`, preserving paths relative to `rootDir`.
async function zipAddTree(zip: ZipFile, rootDir: string, relativePath: string) {
  const absolutePath = join(rootDir, relativePath);
  const stat = await fs.promises.lstat(absolutePath);
  if (stat.isDirectory()) {
    const children = await fs.promises.readdir(absolutePath, {
      withFileTypes: true,
    });
    for (const child of children) {
      if (child.name === '__pycache__') continue;
      await zipAddTree(zip, rootDir, join(relativePath, child.name));
    }
    return;
  }
  if (stat.isFile()) {
    zip.addFile(absolutePath, relativePath, { compress: true });
  }
}

// Returns true if the given file or directory tree contains any zip-unsafe files
// (binaries, cert/key files, etc.).
// Symlinks are treated as zip-unsafe
async function treeHasZipUnsafeFiles(absPath: string): Promise<boolean> {
  try {
    const stat = await fs.promises.lstat(absPath);
    if (stat.isSymbolicLink()) return true;
    if (stat.isFile()) {
      return NON_ZIP_SAFE_EXTENSIONS.has(extname(absPath).toLowerCase());
    }
    if (!stat.isDirectory()) return true;

    const entries = await fs.promises.readdir(absPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '__pycache__') continue;
      if (entry.isDirectory()) {
        if (await treeHasZipUnsafeFiles(join(absPath, entry.name))) return true;
      } else if (entry.isFile()) {
        if (NON_ZIP_SAFE_EXTENSIONS.has(extname(entry.name).toLowerCase()))
          return true;
      } else {
        return true;
      }
    }
    return false;
  } catch {
    return true;
  }
}

// Heuristic: detect code patterns that require a real filesystem directory next to the module.
// These patterns are typically not zip-safe because zipimport does not provide a real directory.
async function hasZipUnsafePatternsInFile(
  fileAbsPath: string
): Promise<boolean> {
  try {
    const src = await fs.promises.readFile(fileAbsPath, 'utf8');
    // Quick escapes
    if (
      src.indexOf('__file__') === -1 &&
      src.indexOf('__path__') === -1 &&
      src.indexOf('__spec__.origin') === -1 &&
      src.indexOf('__loader__') === -1 &&
      src.indexOf('pkgutil.walk_packages') === -1 &&
      src.indexOf('pkgutil.iter_modules') === -1 &&
      src.indexOf('inspect.getfile') === -1 &&
      src.indexOf('inspect.getsourcefile') === -1 &&
      src.indexOf('pkg_resources') === -1
    ) {
      return false;
    }
    const patterns: RegExp[] = [
      // Opening files relative to the current module's directory
      /open\s*\(\s*os\.path\.join\(\s*os\.path\.dirname\(__file__\)/,
      // Listing directory contents of the current module's directory
      /os\.listdir\(\s*os\.path\.dirname\(__file__\)\s*\)/,
      // Walking the filesystem starting from the current module's directory
      /os\.walk\(\s*os\.path\.dirname\(__file__\)\s*\)/,
      // Using glob patterns to find files relative to the current module's directory
      /glob\.glob\(\s*os\.path\.join\(\s*os\.path\.dirname\(__file__\)/,
      // Using __spec__.origin combined with filesystem operations
      /open\s*\(\s*os\.path\.join\(\s*os\.path\.dirname\(__spec__\.origin\)/,
      /os\.listdir\(\s*os\.path\.dirname\(__spec__\.origin\)\s*\)/,
      /os\.walk\(\s*os\.path\.dirname\(__spec__\.origin\)\s*\)/,
      /glob\.glob\(\s*os\.path\.join\(\s*os\.path\.dirname\(__spec__\.origin\)/,
      /Path\(\s*__spec__\.origin\s*\)\.parent[^\n]*\.(?:open|iterdir|glob)\s*\(/,
      // Using __loader__.path or __loader__.get_filename(...) combined with filesystem operations
      /open\s*\(\s*os\.path\.join\(\s*os\.path\.dirname\(__loader__\.(?:path|get_filename\([^)]*\))\)/,
      /os\.listdir\(\s*os\.path\.dirname\(__loader__\.(?:path|get_filename\([^)]*\))\)\s*\)/,
      /os\.walk\(\s*os\.path\.dirname\(__loader__\.(?:path|get_filename\([^)]*\))\)\s*\)/,
      /glob\.glob\(\s*os\.path\.join\(\s*os\.path\.dirname\(__loader__\.(?:path|get_filename\([^)]*\))\)/,
      /Path\(\s*__loader__\.(?:path|get_filename\([^)]*\))\s*\)\.parent[^\n]*\.(?:open|iterdir|glob)\s*\(/,
      // Using pkgutil.get_loader(...).get_filename() combined with filesystem operations
      /open\s*\(\s*os\.path\.join\(\s*os\.path\.dirname\(pkgutil\.get_loader\([^)]*\)\.get_filename\(\)\)/,
      /os\.listdir\(\s*os\.path\.dirname\(pkgutil\.get_loader\([^)]*\)\.get_filename\(\)\)\s*\)/,
      /os\.walk\(\s*os\.path\.dirname\(pkgutil\.get_loader\([^)]*\)\.get_filename\(\)\)\s*\)/,
      /glob\.glob\(\s*os\.path\.join\(\s*os\.path\.dirname\(pkgutil\.get_loader\([^)]*\)\.get_filename\(\)\)/,
      /Path\(\s*pkgutil\.get_loader\([^)]*\)\.get_filename\(\)\s*\)\.parent[^\n]*\.(?:open|iterdir|glob)\s*\(/,
      // Opening files using pathlib relative to the current module's parent directory
      /Path\(\s*__file__\s*\)\.parent[^\n]*\.open\s*\(/,
      // Iterating directory contents using pathlib relative to the current module's parent directory
      /Path\(\s*__file__\s*\)\.parent[^\n]*\.iterdir\s*\(/,
      // Using glob patterns with pathlib relative to the current module's parent directory
      /Path\(\s*__file__\s*\)\.parent[^\n]*\.glob\s*\(/,
      // Using inspect module to get file paths, which requires real filesystem access
      /inspect\.(getfile|getsourcefile)\s*\(/,
      // Directory scanning for submodules via pkgutil on a filesystem path
      /pkgutil\.(walk_packages|iter_modules)\([^)]*os\.path\.dirname\(__file__\)/,
      // Directory scanning for submodules via pkgutil on a package path
      /pkgutil\.(walk_packages|iter_modules)\([^)]*__path__[^)]*\)/,
      // pkg_resources API that requires real file paths
      /pkg_resources\.resource_filename\s*\(/,
      // Unqualified import-and-call of resource_filename
      /from\s+pkg_resources\s+import\s+resource_filename(?:\s+as\s+\w+)?/,
      /(?:^|\W)resource_filename\s*\(/,
      // Note: resource_stream/resource_string/resource_listdir are zip-safe and not flagged
      // importlib.resources.(path|as_file) are designed to be zip-safe as they extract to temp files
      // Using __path__ index combined with filesystem operations
      /open\s*\(\s*os\.path\.join\(\s*os\.path\.dirname\(__path__\[[^\]]+\]\)/,
      /os\.listdir\(\s*os\.path\.dirname\(__path__\[[^\]]+\]\)\s*\)/,
      /os\.walk\(\s*os\.path\.dirname\(__path__\[[^\]]+\]\)\s*\)/,
      /glob\.glob\(\s*os\.path\.join\(\s*os\.path\.dirname\(__path__\[[^\]]+\]\)/,
      /Path\(\s*__path__\[[^\]]+\]\s*\)\.parent[^\n]*\.(?:open|iterdir|glob)\s*\(/,
    ];
    for (const re of patterns) {
      if (re.test(src)) return true;
    }
    // Generic: if __file__ is used and file operations exist nearby, treat as unsafe
    if (src.indexOf('__file__') !== -1) {
      const genericOps = [
        'open(',
        'os.listdir(',
        'os.walk(',
        'glob.glob(',
        '.iterdir(',
        '.read_text(',
        '.read_bytes(',
        'os.path.exists(',
        'os.path.isdir(',
        'os.path.isfile(',
        '.exists(',
        '.is_dir(',
        '.is_file(',
        '.resolve(',
        '.joinpath(',
      ];
      for (const op of genericOps) {
        if (src.indexOf(op) !== -1) return true;
      }
    }
    // If __path__ appears with filesystem-like operations, treat as unsafe
    if (src.indexOf('__path__') !== -1) {
      const pathOps = [
        'os.listdir(',
        'os.walk(',
        'glob.glob(',
        '.iterdir(',
        '.exists(',
        '.is_dir(',
        '.is_file(',
      ];
      for (const op of pathOps) {
        if (src.indexOf(op) !== -1) return true;
      }
    }
    // gettext lookups typically require real filesystem directories for locales
    if (
      (src.indexOf('gettext.find(') !== -1 ||
        src.indexOf('gettext.translation(') !== -1) &&
      (src.indexOf('__file__') !== -1 || src.indexOf('__path__') !== -1)
    ) {
      return true;
    }
    // importlib.resources.files(...) often misused: if converted to a string path or used with open()
    if (src.indexOf('importlib.resources.files(') !== -1) {
      const riskyConsumers = ['.as_posix(', 'os.fspath(', 'str(', 'open('];
      for (const c of riskyConsumers) {
        if (src.indexOf(c) !== -1) return true;
      }
    }
    // Path(__file__).parents[n] suggests deriving real directories; treat as unsafe
    if (
      src.indexOf('Path(__file__)') !== -1 &&
      src.indexOf('.parents[') !== -1
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function hasZipUnsafePatternsInTree(
  dirAbsPath: string
): Promise<boolean> {
  const entries = await fs.promises.readdir(dirAbsPath, {
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (entry.name === '__pycache__') continue;
    const abs = join(dirAbsPath, entry.name);
    if (entry.isDirectory()) {
      if (await hasZipUnsafePatternsInTree(abs)) return true;
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (ALLOWED_SOURCE_EXTENSIONS.has(ext)) {
        if (await hasZipUnsafePatternsInFile(abs)) return true;
      }
    }
  }
  return false;
}

// Returns true if any directory in the tree contains Python source files but lacks a
// top-level __init__.py file, which can be problematic to import from within a zip.
async function hasNamespaceSubpackagesInTree(
  dirAbsPath: string,
  depth = 0
): Promise<boolean> {
  const entries = await fs.promises.readdir(dirAbsPath, {
    withFileTypes: true,
  });
  let hasPy = false;
  let hasInit = false;

  for (const entry of entries) {
    if (entry.name === '__pycache__') continue;
    if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (entry.name === '__init__.py') hasInit = true;
      if (ext === '.py' || ext === '.pyi') hasPy = true;
    }
  }
  // Allow missing __init__.py at the root (namespace package), but require it for subdirectories
  if (depth > 0 && hasPy && !hasInit) return true;

  for (const entry of entries) {
    if (entry.name === '__pycache__') continue;
    if (entry.isDirectory()) {
      const abs = join(dirAbsPath, entry.name);
      if (await hasNamespaceSubpackagesInTree(abs, depth + 1)) return true;
    }
  }
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

async function isZipSafePackageDir(absPath: string): Promise<boolean> {
  return !(
    (await treeHasZipUnsafeFiles(absPath)) ||
    (await hasZipUnsafePatternsInTree(absPath)) ||
    (await hasNamespaceSubpackagesInTree(absPath))
  );
}

async function isZipSafeModuleFile(absFilePath: string): Promise<boolean> {
  return (
    ALLOWED_SOURCE_EXTENSIONS.has(extname(absFilePath).toLowerCase()) &&
    !(await hasZipUnsafePatternsInFile(absFilePath))
  );
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
      // Allow namespace packages at the root, but ensure the tree actually contains Python source
      if (!(await dirHasPythonSourceInTree(absEntryPath))) {
        continue;
      }
      if (await isZipSafePackageDir(absEntryPath)) {
        candidates.push(relEntryPath);
      }
    } else if (entry.isFile()) {
      const ext = extname(name).toLowerCase();
      if (
        ALLOWED_SOURCE_EXTENSIONS.has(ext) &&
        (await isZipSafeModuleFile(absEntryPath))
      ) {
        candidates.push(relEntryPath);
      }
    }
  }

  return candidates;
}

export async function zipPurePythonPackages(vendorDirAbsolutePath: string) {
  const candidates = await collectPurePythonTopLevelCandidates(
    vendorDirAbsolutePath
  );

  if (candidates.length === 0) {
    debug('No pure-Python packages found to zip');
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

  debug(`Creating vendor pure-Python zip with ${candidates.length} entries...`);

  // First pass: zip all candidates to temp file
  const writeZip = async (entries: string[], destPath: string) => {
    const zip = new ZipFile();
    const out = fs.createWriteStream(destPath);
    const done = new Promise<void>((resolve, reject) => {
      out.on('close', resolve);
      out.on('error', reject);
    });
    zip.outputStream.pipe(out);
    for (const relativeEntryPath of entries) {
      await zipAddTree(zip, vendorDirAbsolutePath, relativeEntryPath);
    }
    zip.end();
    await done;
  };

  await writeZip(candidates, zipTempPath);

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
