import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

// The parts of the snapshot that run on a system Node. `pkg.js` and
// `native-esbuild.js` only make sense inside the binary.
export const EJECTED_ENTRIES = ['dist', 'node_modules', 'package.json'];
export const EJECT_MANIFEST = 'eject-manifest.json';

const SHEBANG = Buffer.from('#!/usr/bin/env node');
const NEWLINE = 0x0a;
const EXECUTABLE_MAGIC = [
  Buffer.from('#!'),
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
  Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
  Buffer.from([0xce, 0xfa, 0xed, 0xfe]),
  Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
];

// pkg replaces the shebang line of scripts it compiles with an empty line.
function restoreShebang(contents) {
  if (contents.subarray(0, 2).equals(EXECUTABLE_MAGIC[0])) return contents;
  if (contents[0] === NEWLINE) return Buffer.concat([SHEBANG, contents]);
  return Buffer.concat([SHEBANG, Buffer.from([NEWLINE]), contents]);
}

// The snapshot reports every file as 0644, so derive the executable bit from
// the contents: scripts, ELF binaries (esbuild on Linux) and Mach-O binaries.
function isExecutable(contents) {
  return EXECUTABLE_MAGIC.some(magic =>
    contents.subarray(0, magic.length).equals(magic)
  );
}

/**
 * Copy the CLI's embedded files out of the binary snapshot so a system Node
 * can run them. Writes `eject-manifest.json` with the CLI version, the
 * binary's platform and a SHA-256 per file.
 */
export function ejectSnapshot(snapshotRoot, target) {
  const destination = resolve(target);
  if (existsSync(destination) && readdirSync(destination).length > 0) {
    throw new Error(`Cannot eject into ${destination}: it is not empty.`);
  }

  /** @type {Record<string, string>} */
  const files = {};
  // pkg's snapshot filesystem patches the synchronous primitives; `fs.cp` and
  // streams are not guaranteed to read from it.
  function copy(relativePath) {
    const from = join(snapshotRoot, relativePath);
    const to = join(destination, relativePath);
    const stat = statSync(from);
    if (stat.isDirectory()) {
      mkdirSync(to, { recursive: true });
      for (const entry of readdirSync(from).sort()) {
        copy(`${relativePath}/${entry}`);
      }
      return;
    }
    let contents = readFileSync(from);
    if (relativePath === 'dist/vc.js') {
      contents = restoreShebang(contents);
    }
    const mode = isExecutable(contents) ? 0o755 : stat.mode & 0o777;
    writeFileSync(to, contents, { mode });
    files[relativePath] = createHash('sha256').update(contents).digest('hex');
  }

  for (const entry of EJECTED_ENTRIES) {
    copy(entry);
  }

  const { version } = JSON.parse(
    readFileSync(join(snapshotRoot, 'package.json'), 'utf8')
  );
  const manifest = {
    version,
    platform: process.platform,
    arch: process.arch,
    files,
  };
  writeFileSync(
    join(destination, EJECT_MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  return manifest;
}
