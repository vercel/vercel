import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Eject the packaged binary and check that the result is the CLI's own `dist/`
// plus the Builder graphs, and that it runs on the system Node. The build
// container runs this ejected copy instead of the binary.
const packageRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

function listFiles(root, dir = root) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listFiles(root, path));
    } else {
      files.push(relative(root, path).split(sep).join('/'));
    }
  }
  return files;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Compare an ejected tree against the built `dist/`. Returns a list of
 * problems; an empty list means the eject is faithful.
 */
export function compareEject({ ejectedRoot, distRoot, version }) {
  const problems = [];
  const manifest = JSON.parse(
    readFileSync(join(ejectedRoot, 'eject-manifest.json'), 'utf8')
  );
  if (manifest.version !== version) {
    problems.push(
      `eject-manifest.json version ${manifest.version} does not match ${version}`
    );
  }

  for (const [file, hash] of Object.entries(manifest.files)) {
    if (sha256(join(ejectedRoot, file)) !== hash) {
      problems.push(`${file} does not match its eject-manifest.json hash`);
    }
  }

  const ejectedDist = join(ejectedRoot, 'dist');
  const ejectedFiles = new Set(
    listFiles(ejectedDist).filter(file => !file.startsWith('builders/'))
  );
  for (const file of listFiles(distRoot)) {
    if (!ejectedFiles.delete(file)) {
      problems.push(`dist/${file} is missing from the eject`);
    } else if (
      sha256(join(distRoot, file)) !== sha256(join(ejectedDist, file))
    ) {
      problems.push(`dist/${file} differs from the built dist`);
    }
  }
  for (const file of ejectedFiles) {
    problems.push(`dist/${file} is only in the eject`);
  }
  for (const file of ['builder-graph.json.br', 'builder-index.json']) {
    if (!manifest.files[`dist/builders/${file}`]) {
      problems.push(`dist/builders/${file} is missing from the eject`);
    }
  }
  return problems;
}

export function verifyNativeEject(binPath) {
  const { version } = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8')
  );
  const workDir = mkdtempSync(join(tmpdir(), 'vercel-eject-'));
  const ejectedRoot = join(workDir, 'vercel');
  try {
    execFileSync(binPath, ['--internal-eject', ejectedRoot], {
      stdio: 'inherit',
    });
    const problems = compareEject({
      ejectedRoot,
      distRoot: join(packageRoot, 'dist'),
      version,
    });
    const reported = execFileSync(
      process.execPath,
      [join(ejectedRoot, 'dist', 'vc.js'), '--version'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    if (reported !== version) {
      problems.push(`ejected CLI reported version ${reported}`);
    }
    return problems;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const binArg = process.argv[2] ?? 'dist-bin/vercel';
  const binPath = isAbsolute(binArg) ? binArg : join(packageRoot, binArg);
  const problems = verifyNativeEject(binPath);
  if (problems.length > 0) {
    console.error(`Native eject verification FAILED:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log('Native eject verification PASSED.');
}
